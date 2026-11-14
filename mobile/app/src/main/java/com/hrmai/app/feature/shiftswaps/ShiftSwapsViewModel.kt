package com.hrmai.app.feature.shiftswaps

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.core.util.Format
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

data class ShiftSwapsUiState(
    val role: String? = null,
    val canDecide: Boolean = false,
    val myEmployeeId: Int? = null,
    val items: List<ShiftSwapDto> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    val refreshing: Boolean = false,
    /** null = tất cả, còn lại pending/approved/rejected/cancelled. */
    val statusFilter: String? = null,
    val mineOnly: Boolean = false,
    // Form tạo đơn
    val showCreate: Boolean = false,
    val colleagues: List<SwapColleagueDto> = emptyList(),
    val colleaguesLoading: Boolean = false,
    val showColleaguePicker: Boolean = false,
    val selectedTarget: SwapColleagueDto? = null,
    val workDate: LocalDate? = null,
    val note: String = "",
    val formError: String? = null,
    val submitting: Boolean = false,
    /** Bật đúng một nhịp khi tạo đơn thành công (để đóng hộp thoại). */
    val submitted: Boolean = false,
    // Chi tiết + duyệt/từ chối/hủy
    val selected: ShiftSwapDto? = null,
    val rejectTarget: ShiftSwapDto? = null,
    val rejectNote: String = "",
    /** Id đơn đang thực hiện duyệt/từ chối/hủy (khóa nút). */
    val actingId: Int? = null,
    val message: String? = null,
)

class ShiftSwapsViewModel(
    private val api: ShiftSwapsApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ShiftSwapsUiState())
    val state: StateFlow<ShiftSwapsUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                if (_state.value.role != role || _state.value.myEmployeeId != session?.user?.employeeId) {
                    _state.update {
                        it.copy(
                            role = role,
                            canDecide = role in DECIDE_ROLES,
                            myEmployeeId = session?.user?.employeeId,
                        )
                    }
                }
            }
        }
        load()
    }

    // ------------------------------------------------------------------
    // Danh sách
    // ------------------------------------------------------------------
    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            fetchList()
        }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetchList()
            _state.update { it.copy(refreshing = false) }
        }
    }

    private suspend fun fetchList() {
        val s = _state.value
        runCatching {
            api.getShiftSwaps(
                status = s.statusFilter,
                mine = if (s.mineOnly) 1 else null,
                page = 1,
                limit = 50,
            )
        }.onSuccess { resp ->
            _state.update {
                it.copy(items = resp.data ?: emptyList(), loading = false, error = null)
            }
        }.onFailure { e ->
            _state.update {
                it.copy(loading = false, error = e.toApiException().message)
            }
        }
    }

    fun setStatusFilter(status: String?) {
        if (_state.value.statusFilter == status) return
        _state.update { it.copy(statusFilter = status) }
        load()
    }

    fun setMineOnly(mineOnly: Boolean) {
        if (_state.value.mineOnly == mineOnly) return
        _state.update { it.copy(mineOnly = mineOnly) }
        load()
    }

    // ------------------------------------------------------------------
    // Tạo đơn mới — bám form web: chọn đồng nghiệp + ngày + lý do.
    // ------------------------------------------------------------------
    fun openCreate() {
        _state.update {
            it.copy(
                showCreate = true,
                formError = null,
                selectedTarget = null,
                workDate = null,
                note = "",
            )
        }
        if (_state.value.colleagues.isEmpty()) loadColleagues()
    }

    fun closeCreate() = _state.update { it.copy(showCreate = false, formError = null) }

    fun openColleaguePicker() {
        _state.update { it.copy(showColleaguePicker = true) }
        if (_state.value.colleagues.isEmpty()) loadColleagues()
    }

    fun closeColleaguePicker() = _state.update { it.copy(showColleaguePicker = false) }

    fun selectTarget(colleague: SwapColleagueDto) {
        _state.update {
            it.copy(selectedTarget = colleague, showColleaguePicker = false, formError = null)
        }
    }

    fun setWorkDate(date: LocalDate) = _state.update { it.copy(workDate = date, formError = null) }

    fun setNote(text: String) = _state.update { it.copy(note = text, formError = null) }

    private fun loadColleagues() {
        if (_state.value.colleaguesLoading) return
        viewModelScope.launch {
            _state.update { it.copy(colleaguesLoading = true) }
            runCatching { api.getColleagues(limit = 100) }
                .onSuccess { resp ->
                    _state.update { st ->
                        val mine = st.myEmployeeId
                        st.copy(
                            colleagues = (resp.data ?: emptyList())
                                .filter { it.id != mine },
                            colleaguesLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            colleaguesLoading = false,
                            formError = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun submitCreate() {
        val s = _state.value
        if (s.submitting) return
        val error = when {
            s.selectedTarget?.id == null -> "Hãy chọn đồng nghiệp muốn đổi ca."
            s.workDate == null -> "Hãy chọn ngày đổi ca."
            s.workDate.isBefore(Format.today()) -> "Ngày đổi ca phải từ hôm nay trở đi."
            else -> null
        }
        if (error != null) {
            _state.update { it.copy(formError = error) }
            return
        }
        _state.update { it.copy(submitting = true, formError = null) }
        viewModelScope.launch {
            runCatching {
                api.createShiftSwap(
                    CreateShiftSwapBody(
                        targetId = s.selectedTarget!!.id!!,
                        workDate = s.workDate!!.toString(),
                        note = s.note.trim().ifBlank { null },
                    ),
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        submitting = false,
                        submitted = true,
                        selectedTarget = null,
                        workDate = null,
                        note = "",
                        message = "Đã tạo đơn đổi ca, đang chờ duyệt.",
                    )
                }
                load()
            }.onFailure { e ->
                _state.update {
                    it.copy(submitting = false, formError = e.toApiException().message)
                }
            }
        }
    }

    fun consumeSubmitted() = _state.update { it.copy(submitted = false) }

    // ------------------------------------------------------------------
    // Chi tiết
    // ------------------------------------------------------------------
    fun selectDetail(item: ShiftSwapDto) = _state.update { it.copy(selected = item) }

    fun closeDetail() = _state.update { it.copy(selected = null) }

    // ------------------------------------------------------------------
    // Duyệt / từ chối / hủy — sau mỗi action thành công thì reload list.
    // ------------------------------------------------------------------
    fun approveSwap(item: ShiftSwapDto) {
        val id = item.id ?: return
        act(id) { api.approveShiftSwap(id) }
    }

    fun openReject(item: ShiftSwapDto) {
        _state.update { it.copy(rejectTarget = item, rejectNote = "") }
    }

    fun closeReject() = _state.update { it.copy(rejectTarget = null, rejectNote = "") }

    fun setRejectNote(text: String) = _state.update { it.copy(rejectNote = text) }

    fun rejectSwap() {
        val item = _state.value.rejectTarget ?: return
        val id = item.id ?: return
        val note = _state.value.rejectNote.trim().ifBlank { null }
        _state.update { it.copy(rejectTarget = null, rejectNote = "") }
        act(id, "Đã từ chối đơn đổi ca.") {
            api.rejectShiftSwap(id, ShiftSwapDecisionBody(note = note))
        }
    }

    fun cancelSwap(item: ShiftSwapDto) {
        val id = item.id ?: return
        act(id, "Đã hủy đơn đổi ca.") { api.cancelShiftSwap(id) }
    }

    private fun act(id: Int, successMessage: String? = null, call: suspend () -> ShiftSwapSingleResponse) {
        if (_state.value.actingId != null) return
        _state.update { it.copy(actingId = id, selected = null) }
        viewModelScope.launch {
            runCatching { call() }
                .onSuccess {
                    _state.update {
                        it.copy(
                            actingId = null,
                            message = successMessage
                                ?: "Đã duyệt đơn đổi ca — ca làm hai người đã được hoán đổi.",
                        )
                    }
                    load()
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(actingId = null, message = e.toApiException().message)
                    }
                }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: ShiftSwapsApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ShiftSwapsViewModel(api, sessionStore) as T
    }

    companion object {
        /** Quyền duyệt theo DECIDE_ROLES của backend (routes.py). */
        private val DECIDE_ROLES = setOf("admin", "hr", "manager")
    }
}
