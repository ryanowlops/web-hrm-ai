package com.hrmai.app.feature.leave

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

data class LeaveUiState(
    /** 0 = Đơn của tôi, 1 = Tạo đơn, 2 = Duyệt đơn. */
    val tab: Int = 0,
    val role: String? = null,
    val canApprove: Boolean = false,
    // Số dư phép
    val balances: List<LeaveBalanceDto> = emptyList(),
    val balancesLoading: Boolean = true,
    val balancesError: String? = null,
    // Danh mục loại phép (cho form tạo đơn)
    val types: List<LeaveTypeDto> = emptyList(),
    // Đơn của tôi
    val myRequests: List<LeaveRequestDto> = emptyList(),
    val myLoading: Boolean = true,
    val myError: String? = null,
    val myRefreshing: Boolean = false,
    // Hàng đợi duyệt
    val queue: List<LeaveRequestDto> = emptyList(),
    val queueLoading: Boolean = false,
    val queueError: String? = null,
    val queueRefreshing: Boolean = false,
    // Form tạo đơn
    val formTypeId: Int? = null,
    val formFrom: LocalDate? = null,
    val formTo: LocalDate? = null,
    val formReason: String = "",
    val formError: String? = null,
    val submitting: Boolean = false,
    /** Id đơn đang huỷ/duyệt (khoá nút của riêng đơn đó). */
    val actingId: Int? = null,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
)

class LeaveViewModel(
    private val api: LeaveApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(LeaveUiState())
    val state: StateFlow<LeaveUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                if (_state.value.role != role) {
                    val canApprove = role in APPROVER_ROLES
                    _state.update { it.copy(role = role, canApprove = canApprove) }
                    if (canApprove) loadQueue()
                }
            }
        }
        loadTypes()
        loadBalances()
        loadMine()
    }

    // ------------------------------------------------------------------
    // Tải dữ liệu
    // ------------------------------------------------------------------
    fun loadTypes() {
        viewModelScope.launch {
            runCatching { api.getTypes() }
                .onSuccess { resp ->
                    val types = resp.data ?: emptyList()
                    _state.update {
                        it.copy(
                            types = types,
                            formTypeId = it.formTypeId ?: types.firstOrNull()?.id,
                        )
                    }
                }
                .onFailure { /* Form sẽ hiện trạng thái rỗng cho loại phép. */ }
        }
    }

    fun loadBalances() {
        viewModelScope.launch {
            _state.update { it.copy(balancesLoading = true, balancesError = null) }
            runCatching { api.getMyBalances(Format.today().year) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            balances = resp.data ?: emptyList(),
                            balancesLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            balancesLoading = false,
                            balancesError = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun loadMine() {
        viewModelScope.launch {
            _state.update { it.copy(myLoading = true, myError = null) }
            fetchMine()
        }
    }

    private suspend fun fetchMine() {
        runCatching {
            api.getRequests(scope = "mine", status = null, page = 1, limit = 50)
        }.onSuccess { resp ->
            _state.update {
                it.copy(myRequests = resp.data ?: emptyList(), myLoading = false, myError = null)
            }
        }.onFailure { e ->
            _state.update {
                it.copy(myLoading = false, myError = e.toApiException().message)
            }
        }
    }

    fun refreshMine() {
        if (_state.value.myRefreshing) return
        viewModelScope.launch {
            _state.update { it.copy(myRefreshing = true) }
            fetchMine()
            runCatching { api.getMyBalances(Format.today().year) }
                .onSuccess { resp ->
                    _state.update { it.copy(balances = resp.data ?: emptyList()) }
                }
            _state.update { it.copy(myRefreshing = false) }
        }
    }

    fun loadQueue() {
        val s = _state.value
        if (!s.canApprove || s.queueLoading) return
        viewModelScope.launch {
            _state.update { it.copy(queueLoading = true, queueError = null) }
            fetchQueue()
        }
    }

    fun refreshQueue() {
        if (_state.value.queueRefreshing || !_state.value.canApprove) return
        viewModelScope.launch {
            _state.update { it.copy(queueRefreshing = true, queueError = null) }
            fetchQueue()
            _state.update { it.copy(queueRefreshing = false) }
        }
    }

    /** Hàng đợi theo đúng bản web (leave/services.js getPendingForMe):
     *  Manager: scope=team + status=pending; HR/Admin: status=manager_approved. */
    private suspend fun fetchQueue() {
        val role = _state.value.role
        val (scope, status) = when (role) {
            "manager" -> "team" to "pending"
            "hr", "admin" -> null to "manager_approved"
            else -> null to null
        }
        if (status == null) {
            _state.update { it.copy(queueLoading = false) }
            return
        }
        runCatching {
            api.getRequests(scope = scope, status = status, page = 1, limit = 50)
        }.onSuccess { resp ->
            _state.update {
                it.copy(queue = resp.data ?: emptyList(), queueLoading = false, queueError = null)
            }
        }.onFailure { e ->
            _state.update {
                it.copy(queueLoading = false, queueError = e.toApiException().message)
            }
        }
    }

    // ------------------------------------------------------------------
    // Tab + form tạo đơn
    // ------------------------------------------------------------------
    fun selectTab(index: Int) {
        if (index == 2 && !_state.value.canApprove) return
        _state.update { it.copy(tab = index) }
        if (index == 2) loadQueue()
    }

    fun setFormType(id: Int) = _state.update { it.copy(formTypeId = id, formError = null) }

    fun setFormFrom(date: LocalDate) = _state.update { it.copy(formFrom = date, formError = null) }

    fun setFormTo(date: LocalDate) = _state.update { it.copy(formTo = date, formError = null) }

    fun setFormReason(text: String) = _state.update { it.copy(formReason = text, formError = null) }

    fun submitCreate() {
        val s = _state.value
        if (s.submitting) return
        val typeId = s.formTypeId
        val from = s.formFrom
        val to = s.formTo
        val error = when {
            typeId == null -> "Chọn loại phép giúp em nhé."
            from == null -> "Chọn ngày bắt đầu nghỉ nhé."
            to == null -> "Chọn ngày kết thúc nghỉ nhé."
            to.isBefore(from) -> "Ngày kết thúc phải từ ngày bắt đầu trở đi."
            s.formReason.isBlank() -> "Nhập lý do nghỉ giúp em nhé (server yêu cầu)."
            else -> null
        }
        if (error != null) {
            _state.update { it.copy(formError = error) }
            return
        }
        _state.update { it.copy(submitting = true, formError = null) }
        viewModelScope.launch {
            runCatching {
                api.createRequest(
                    CreateLeaveRequestBody(
                        leaveTypeId = typeId!!,
                        fromDate = from!!.toString(),
                        toDate = to!!.toString(),
                        reason = s.formReason.trim(),
                    ),
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        submitting = false,
                        tab = 0,
                        formTypeId = it.types.firstOrNull()?.id,
                        formFrom = null,
                        formTo = null,
                        formReason = "",
                        message = "Đã tạo đơn nghỉ phép, đang chờ duyệt nhé.",
                    )
                }
                loadMine()
                loadBalances()
            }.onFailure { e ->
                _state.update {
                    it.copy(submitting = false, formError = e.toApiException().message)
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Huỷ đơn + duyệt đơn
    // ------------------------------------------------------------------
    /** Server chỉ cho huỷ khi đơn còn ở trạng thái pending (services.cancel_request). */
    fun cancel(request: LeaveRequestDto) {
        val id = request.id ?: return
        if (_state.value.actingId != null) return
        _state.update { it.copy(actingId = id) }
        viewModelScope.launch {
            runCatching { api.cancelRequest(id) }
                .onSuccess {
                    _state.update {
                        it.copy(actingId = null, message = "Đã huỷ đơn nghỉ phép.")
                    }
                    loadMine()
                    loadBalances()
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(actingId = null, message = e.toApiException().message)
                    }
                }
        }
    }

    /** Chọn endpoint theo trạng thái hiện tại của đơn, giống hệt bản web
     *  (decisionPath): manager_approved -> HR quyết định, còn lại -> Manager. */
    fun decide(request: LeaveRequestDto, approved: Boolean, note: String) {
        val id = request.id ?: return
        if (_state.value.actingId != null) return
        if (!approved && note.isBlank()) {
            _state.update { it.copy(message = "Từ chối đơn cần kèm lý do nhé.") }
            return
        }
        _state.update { it.copy(actingId = id) }
        viewModelScope.launch {
            val body = DecisionBody(
                decision = if (approved) "approved" else "rejected",
                note = note.trim().ifBlank { null },
            )
            runCatching {
                if (request.status == "manager_approved") {
                    api.hrDecision(id, body)
                } else {
                    api.managerDecision(id, body)
                }
            }.onSuccess {
                _state.update {
                    it.copy(
                        actingId = null,
                        message = if (approved) "Đã duyệt đơn nghỉ phép." else "Đã từ chối đơn nghỉ phép.",
                    )
                }
                loadQueue()
            }.onFailure { e ->
                // 403/409: hiển thị nguyên thông điệp của server.
                _state.update {
                    it.copy(actingId = null, message = e.toApiException().message)
                }
            }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: LeaveApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            LeaveViewModel(api, sessionStore) as T
    }

    companion object {
        private val APPROVER_ROLES = setOf("manager", "hr", "admin")
    }
}
