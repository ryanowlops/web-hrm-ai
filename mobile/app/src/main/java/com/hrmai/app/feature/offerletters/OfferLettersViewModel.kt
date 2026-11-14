package com.hrmai.app.feature.offerletters

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.core.util.Format
import com.hrmai.app.feature.recruitment.CandidateDto
import com.hrmai.app.feature.recruitment.JobPostingDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

// ---------------------------------------------------------------------------
// Danh sách thư mời nhận việc + tạo mới + gửi / ghi nhận phản hồi / thu hồi.
// Luồng trạng thái (server): draft -> sent -> accepted | declined;
// draft | sent -> withdrawn. 'expired' chỉ tính lúc đọc (sent + quá hạn).
// Sau mỗi action thành công thì tải lại danh sách.
// ---------------------------------------------------------------------------

data class OfferLettersUiState(
    val offers: List<OfferLetterDto> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    /** 403: tài khoản không có quyền xem module (admin/hr mới xem được). */
    val forbidden: Boolean = false,
    val refreshing: Boolean = false,
    /** Lọc theo trạng thái, null = tất cả. */
    val statusFilter: String? = null,
    /** Id thư mời đang thực hiện action (khoá nút của riêng thư đó). */
    val actingId: Int? = null,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
    // --- Form tạo thư mời ---
    val creating: Boolean = false,
    val candidates: List<CandidateDto> = emptyList(),
    val candidatesLoading: Boolean = false,
    val jobs: List<JobPostingDto> = emptyList(),
    val jobsLoading: Boolean = false,
    val formError: String? = null,
    val submitting: Boolean = false,
    // --- Xem nội dung thư ---
    val preview: OfferLetterDto? = null,
)

class OfferLettersViewModel(
    private val api: OfferLettersApi,
    @Suppress("unused") private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(OfferLettersUiState())
    val state: StateFlow<OfferLettersUiState> = _state

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, forbidden = false) }
            fetch()
        }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetch()
            _state.update { it.copy(refreshing = false) }
        }
    }

    private suspend fun fetch() {
        runCatching { api.listOffers(status = _state.value.statusFilter) }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        offers = resp.data ?: emptyList(),
                        loading = false,
                        error = null,
                        forbidden = false,
                    )
                }
            }
            .onFailure { e ->
                val apiErr = e.toApiException()
                _state.update {
                    it.copy(
                        loading = false,
                        forbidden = apiErr.httpStatus == 403,
                        error = if (apiErr.httpStatus == 403) null else apiErr.message,
                    )
                }
            }
    }

    fun setStatusFilter(status: String?) {
        if (status == _state.value.statusFilter) return
        _state.update { it.copy(statusFilter = status) }
        load()
    }

    // --- Tạo thư mời ---

    fun openCreate() {
        _state.update { it.copy(creating = true, formError = null) }
        loadCandidates()
        loadJobs()
    }

    fun closeCreate() {
        _state.update { it.copy(creating = false, formError = null) }
    }

    private fun loadCandidates() {
        viewModelScope.launch {
            _state.update { it.copy(candidatesLoading = true) }
            runCatching { api.listCandidates(limit = 100) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            candidates = resp.data ?: emptyList(),
                            candidatesLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            candidatesLoading = false,
                            formError = e.toApiException().message,
                        )
                    }
                }
        }
    }

    private fun loadJobs() {
        viewModelScope.launch {
            _state.update { it.copy(jobsLoading = true) }
            runCatching { api.listJobs(limit = 100) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            jobs = resp.data ?: emptyList(),
                            jobsLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            jobsLoading = false,
                            formError = e.toApiException().message,
                        )
                    }
                }
        }
    }

    /** Tạo thư mời (đã qua form tạo ở tầng UI) — validate y hệt bản web. */
    fun create(
        candidateId: Int?,
        jobId: Int?,
        salaryText: String,
        startDate: LocalDate?,
        deadline: LocalDate?,
    ) {
        if (candidateId == null) {
            _state.update { it.copy(formError = "Vui lòng chọn ứng viên.") }
            return
        }
        val salary = salaryText.trim().toLongOrNull()
        if (salary == null || salary <= 0) {
            _state.update {
                it.copy(formError = "Lương phải là số nguyên lớn hơn 0 (VNĐ/tháng).")
            }
            return
        }
        if (startDate == null) {
            _state.update { it.copy(formError = "Vui lòng chọn ngày bắt đầu làm việc.") }
            return
        }
        if (startDate < Format.today()) {
            _state.update {
                it.copy(formError = "Ngày bắt đầu làm việc không được trong quá khứ.")
            }
            return
        }
        if (_state.value.submitting) return
        _state.update { it.copy(submitting = true, formError = null) }
        viewModelScope.launch {
            runCatching {
                api.createOffer(
                    CreateOfferBody(
                        candidateId = candidateId,
                        jobId = jobId,
                        salary = salary,
                        startDate = startDate.toString(),
                        deadline = deadline?.toString(),
                    ),
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        submitting = false,
                        creating = false,
                        message = "Đã tạo thư mời nhận việc (trạng thái nháp).",
                    )
                }
                fetch()
            }.onFailure { e ->
                _state.update {
                    it.copy(submitting = false, formError = e.toApiException().message)
                }
            }
        }
    }

    // --- Gửi / ghi nhận phản hồi / thu hồi (đã qua hộp thoại xác nhận ở UI) ---

    fun send(offer: OfferLetterDto) = runAction(offer, "send", "Đã gửi thư mời.")

    fun respond(offer: OfferLetterDto, decision: String) {
        val doneMessage = if (decision == "accepted") {
            "Đã ghi nhận: ứng viên chấp nhận thư mời."
        } else {
            "Đã ghi nhận: ứng viên từ chối thư mời."
        }
        runAction(offer, decision, doneMessage)
    }

    fun withdraw(offer: OfferLetterDto) =
        runAction(offer, "withdraw", "Đã thu hồi thư mời.")

    private fun runAction(offer: OfferLetterDto, type: String, doneMessage: String) {
        val id = offer.id ?: return
        if (_state.value.actingId != null) return
        _state.update { it.copy(actingId = id) }
        viewModelScope.launch {
            runCatching {
                when (type) {
                    "send" -> api.sendOffer(id)
                    "accepted", "declined" -> api.respondOffer(id, RespondOfferBody(type))
                    else -> api.withdrawOffer(id)
                }
            }.onSuccess {
                _state.update { it.copy(actingId = null, message = doneMessage) }
                fetch()
            }.onFailure { e ->
                _state.update {
                    it.copy(actingId = null, message = e.toApiException().message)
                }
            }
        }
    }

    // --- Xem nội dung thư ---

    fun openPreview(offer: OfferLetterDto) {
        _state.update { it.copy(preview = offer) }
    }

    fun closePreview() {
        _state.update { it.copy(preview = null) }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: OfferLettersApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            OfferLettersViewModel(api, sessionStore) as T
    }
}
