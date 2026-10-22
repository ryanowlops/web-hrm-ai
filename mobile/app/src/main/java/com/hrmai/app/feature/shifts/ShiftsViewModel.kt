package com.hrmai.app.feature.shifts

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
import java.time.LocalTime
import java.time.YearMonth

data class ShiftsUiState(
    /** 0 = Lịch ca, 1 = Yêu cầu của tôi, 2 = Duyệt yêu cầu. */
    val tab: Int = 0,
    val role: String? = null,
    val canApprove: Boolean = false,
    // Lịch ca của tôi
    val month: YearMonth = YearMonth.now(Format.ICT),
    val schedule: List<ShiftAssignmentDto> = emptyList(),
    val definitions: List<ShiftDefinitionDto> = emptyList(),
    val scheduleLoading: Boolean = true,
    val scheduleError: String? = null,
    // Yêu cầu của tôi
    val myOvertime: List<OvertimeDto> = emptyList(),
    val myCorrections: List<CorrectionDto> = emptyList(),
    val myLoading: Boolean = true,
    val myError: String? = null,
    val myRefreshing: Boolean = false,
    // Hàng đợi duyệt
    val queueOvertime: List<OvertimeDto> = emptyList(),
    val queueCorrections: List<CorrectionDto> = emptyList(),
    val queueLoading: Boolean = false,
    val queueError: String? = null,
    val queueRefreshing: Boolean = false,
    // Form tăng ca
    val otDate: LocalDate? = null,
    val otHours: String = "",
    val otReason: String = "",
    val otError: String? = null,
    val otSubmitting: Boolean = false,
    /** Bật đúng một nhịp khi gửi tăng ca thành công (để đóng hộp thoại). */
    val otSubmitted: Boolean = false,
    // Form chỉnh công
    val corrDate: LocalDate? = null,
    val corrIn: String = "",
    val corrOut: String = "",
    val corrReason: String = "",
    val corrError: String? = null,
    val corrSubmitting: Boolean = false,
    /** Bật đúng một nhịp khi gửi chỉnh công thành công (để đóng hộp thoại). */
    val corrSubmitted: Boolean = false,
    /** Khoá thao tác: "ot-<id>" hoặc "corr-<id>" của yêu cầu đang duyệt. */
    val actingKey: String? = null,
    val message: String? = null,
)

class ShiftsViewModel(
    private val api: ShiftsApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ShiftsUiState())
    val state: StateFlow<ShiftsUiState> = _state

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
        loadDefinitions()
        loadSchedule()
        loadMine()
    }

    // ------------------------------------------------------------------
    // Lịch ca
    // ------------------------------------------------------------------
    private fun loadDefinitions() {
        viewModelScope.launch {
            runCatching { api.getDefinitions() }
                .onSuccess { resp ->
                    _state.update { it.copy(definitions = resp.data ?: emptyList()) }
                }
        }
    }

    fun loadSchedule() {
        viewModelScope.launch {
            _state.update { it.copy(scheduleLoading = true, scheduleError = null) }
            runCatching { api.getMySchedule(_state.value.month.toString()) }
                .onSuccess { resp ->
                    val items = (resp.data ?: emptyList())
                        .sortedBy { it.workDate ?: "" }
                    _state.update {
                        it.copy(schedule = items, scheduleLoading = false)
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            scheduleLoading = false,
                            scheduleError = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun shiftMonth(delta: Long) {
        _state.update { it.copy(month = it.month.plusMonths(delta)) }
        loadSchedule()
    }

    // ------------------------------------------------------------------
    // Yêu cầu của tôi
    // ------------------------------------------------------------------
    fun loadMine() {
        viewModelScope.launch {
            _state.update { it.copy(myLoading = true, myError = null) }
            fetchMine()
        }
    }

    private suspend fun fetchMine() {
        runCatching {
            val ot = api.getOvertime(scope = "mine", status = null, page = 1, limit = 50)
            val corr = api.getCorrections(scope = "mine", status = null, page = 1, limit = 50)
            ot to corr
        }.onSuccess { (ot, corr) ->
            _state.update {
                it.copy(
                    myOvertime = ot.data ?: emptyList(),
                    myCorrections = corr.data ?: emptyList(),
                    myLoading = false,
                    myError = null,
                )
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
            _state.update { it.copy(myRefreshing = false) }
        }
    }

    // ------------------------------------------------------------------
    // Hàng đợi duyệt — bám leave: Manager scope=team + pending,
    // HR/Admin status=manager_approved (toàn công ty).
    // ------------------------------------------------------------------
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

    private suspend fun fetchQueue() {
        val (scope, status) = when (_state.value.role) {
            "manager" -> "team" to "pending"
            "hr", "admin" -> null to "manager_approved"
            else -> null to null
        }
        if (status == null) {
            _state.update { it.copy(queueLoading = false) }
            return
        }
        runCatching {
            val ot = api.getOvertime(scope = scope, status = status, page = 1, limit = 50)
            val corr = api.getCorrections(scope = scope, status = status, page = 1, limit = 50)
            ot to corr
        }.onSuccess { (ot, corr) ->
            _state.update {
                it.copy(
                    queueOvertime = ot.data ?: emptyList(),
                    queueCorrections = corr.data ?: emptyList(),
                    queueLoading = false,
                    queueError = null,
                )
            }
        }.onFailure { e ->
            _state.update {
                it.copy(queueLoading = false, queueError = e.toApiException().message)
            }
        }
    }

    // ------------------------------------------------------------------
    // Tab + form
    // ------------------------------------------------------------------
    fun selectTab(index: Int) {
        if (index == 2 && !_state.value.canApprove) return
        _state.update { it.copy(tab = index) }
        if (index == 2) loadQueue()
    }

    fun setOtDate(date: LocalDate) = _state.update { it.copy(otDate = date, otError = null) }
    fun setOtHours(text: String) = _state.update { it.copy(otHours = text, otError = null) }
    fun setOtReason(text: String) = _state.update { it.copy(otReason = text, otError = null) }

    fun setCorrDate(date: LocalDate) = _state.update { it.copy(corrDate = date, corrError = null) }
    fun setCorrIn(text: String) = _state.update { it.copy(corrIn = text, corrError = null) }
    fun setCorrOut(text: String) = _state.update { it.copy(corrOut = text, corrError = null) }
    fun setCorrReason(text: String) =
        _state.update { it.copy(corrReason = text, corrError = null) }

    fun submitOvertime() {
        val s = _state.value
        if (s.otSubmitting) return
        val hours = s.otHours.trim().replace(',', '.').toDoubleOrNull()
        val error = when {
            s.otDate == null -> "Chọn ngày tăng ca nhé."
            hours == null -> "Nhập số giờ tăng ca (ví dụ 2 hoặc 2,5)."
            hours <= 0 || hours > 16 -> "Số giờ tăng ca phải trong khoảng (0, 16]."
            else -> null
        }
        if (error != null) {
            _state.update { it.copy(otError = error) }
            return
        }
        _state.update { it.copy(otSubmitting = true, otError = null) }
        viewModelScope.launch {
            runCatching {
                api.createOvertime(
                    CreateOvertimeBody(
                        workDate = s.otDate!!.toString(),
                        hours = hours!!,
                        reason = s.otReason.trim().ifBlank { null },
                    ),
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        otSubmitting = false,
                        otSubmitted = true,
                        otDate = null,
                        otHours = "",
                        otReason = "",
                        message = "Đã gửi yêu cầu tăng ca, đang chờ duyệt nhé.",
                    )
                }
                loadMine()
            }.onFailure { e ->
                _state.update {
                    it.copy(otSubmitting = false, otError = e.toApiException().message)
                }
            }
        }
    }

    fun submitCorrection() {
        val s = _state.value
        if (s.corrSubmitting) return
        val inTime = parseTimeOrNull(s.corrIn)
        val outTime = parseTimeOrNull(s.corrOut)
        val error = when {
            s.corrDate == null -> "Chọn ngày cần chỉnh công nhé."
            s.corrIn.isNotBlank() && inTime == null ->
                "Giờ vào chưa đúng định dạng HH:mm (ví dụ 08:30)."
            s.corrOut.isNotBlank() && outTime == null ->
                "Giờ ra chưa đúng định dạng HH:mm (ví dụ 17:30)."
            inTime == null && outTime == null ->
                "Đề xuất ít nhất giờ vào hoặc giờ ra nhé."
            inTime != null && outTime != null && !outTime.isAfter(inTime) ->
                "Giờ ra phải sau giờ vào."
            s.corrReason.isBlank() -> "Nhập lý do chỉnh công giúp em nhé (server yêu cầu)."
            else -> null
        }
        if (error != null) {
            _state.update { it.copy(corrError = error) }
            return
        }
        val date = s.corrDate!!
        _state.update { it.copy(corrSubmitting = true, corrError = null) }
        viewModelScope.launch {
            runCatching {
                api.createCorrection(
                    CreateCorrectionBody(
                        workDate = date.toString(),
                        requestedCheckIn = inTime?.let { "$date" + "T" + it + ":00" },
                        requestedCheckOut = outTime?.let { "$date" + "T" + it + ":00" },
                        reason = s.corrReason.trim(),
                    ),
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        corrSubmitting = false,
                        corrSubmitted = true,
                        corrDate = null,
                        corrIn = "",
                        corrOut = "",
                        corrReason = "",
                        message = "Đã gửi yêu cầu chỉnh công, đang chờ duyệt nhé.",
                    )
                }
                loadMine()
            }.onFailure { e ->
                _state.update {
                    it.copy(corrSubmitting = false, corrError = e.toApiException().message)
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Duyệt yêu cầu — chọn endpoint theo trạng thái như bản web:
    // manager_approved -> HR quyết định, còn lại -> Manager quyết định.
    // ------------------------------------------------------------------
    fun decideOvertime(item: OvertimeDto, approved: Boolean, note: String) {
        val id = item.id ?: return
        decide(key = "ot-$id", approved = approved, note = note) {
            val body = ShiftDecisionBody(
                decision = if (approved) "approved" else "rejected",
                note = note.trim().ifBlank { null },
            )
            if (item.status == "manager_approved") {
                api.overtimeHrDecision(id, body)
            } else {
                api.overtimeManagerDecision(id, body)
            }
        }
    }

    fun decideCorrection(item: CorrectionDto, approved: Boolean, note: String) {
        val id = item.id ?: return
        decide(key = "corr-$id", approved = approved, note = note) {
            val body = ShiftDecisionBody(
                decision = if (approved) "approved" else "rejected",
                note = note.trim().ifBlank { null },
            )
            if (item.status == "manager_approved") {
                api.correctionHrDecision(id, body)
            } else {
                api.correctionManagerDecision(id, body)
            }
        }
    }

    private fun decide(
        key: String,
        approved: Boolean,
        note: String,
        call: suspend () -> Any?,
    ) {
        if (_state.value.actingKey != null) return
        if (!approved && note.isBlank()) {
            _state.update { it.copy(message = "Từ chối yêu cầu cần kèm lý do nhé.") }
            return
        }
        _state.update { it.copy(actingKey = key) }
        viewModelScope.launch {
            runCatching { call() }
                .onSuccess {
                    _state.update {
                        it.copy(
                            actingKey = null,
                            message = if (approved) {
                                "Đã duyệt yêu cầu."
                            } else {
                                "Đã từ chối yêu cầu."
                            },
                        )
                    }
                    loadQueue()
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(actingKey = null, message = e.toApiException().message)
                    }
                }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    fun consumeOtSubmitted() = _state.update { it.copy(otSubmitted = false) }

    fun consumeCorrSubmitted() = _state.update { it.copy(corrSubmitted = false) }

    /** "8:5"/"08:30" -> LocalTime; rỗng hoặc sai định dạng -> null. */
    private fun parseTimeOrNull(text: String): LocalTime? {
        val t = text.trim()
        if (t.isBlank()) return null
        return runCatching { LocalTime.parse(if (t.length == 4) "0$t" else t) }.getOrNull()
    }

    class Factory(
        private val api: ShiftsApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ShiftsViewModel(api, sessionStore) as T
    }

    companion object {
        private val APPROVER_ROLES = setOf("manager", "hr", "admin")
    }
}
