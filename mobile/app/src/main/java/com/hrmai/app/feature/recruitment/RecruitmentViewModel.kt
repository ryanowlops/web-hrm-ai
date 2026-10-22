package com.hrmai.app.feature.recruitment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// Danh sách tin tuyển dụng
// ---------------------------------------------------------------------------

data class RecruitmentUiState(
    val jobs: List<JobPostingDto> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    /** 403: tài khoản không có quyền xem module (phòng khi server siết). */
    val forbidden: Boolean = false,
    val refreshing: Boolean = false,
)

class RecruitmentViewModel(
    private val api: RecruitmentApi,
    @Suppress("unused") private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(RecruitmentUiState())
    val state: StateFlow<RecruitmentUiState> = _state

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
        runCatching { api.listJobs() }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        jobs = resp.data ?: emptyList(),
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

    class Factory(
        private val api: RecruitmentApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            RecruitmentViewModel(api, sessionStore) as T
    }
}

// ---------------------------------------------------------------------------
// Chi tiết tin + danh sách ứng viên của tin
// ---------------------------------------------------------------------------

data class JobDetailUiState(
    val job: JobPostingDto? = null,
    val jobLoading: Boolean = true,
    val jobError: String? = null,
    val candidates: List<CandidateDto> = emptyList(),
    val candidatesLoading: Boolean = true,
    val candidatesError: String? = null,
    /** Ứng viên chỉ Admin/HR xem được — 403 thì hiện trạng thái giới hạn quyền. */
    val candidatesForbidden: Boolean = false,
    val refreshing: Boolean = false,
    /** Id ứng viên đang đổi trạng thái (khoá nút của riêng ứng viên đó). */
    val actingId: Int? = null,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
)

class JobDetailViewModel(
    private val api: RecruitmentApi,
    @Suppress("unused") private val sessionStore: SessionStore,
    private val jobId: Int,
) : ViewModel() {

    private val _state = MutableStateFlow(JobDetailUiState())
    val state: StateFlow<JobDetailUiState> = _state

    init {
        loadAll()
    }

    fun loadAll() {
        loadJob()
        loadCandidates()
    }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            loadJob()
            loadCandidates()
            _state.update { it.copy(refreshing = false) }
        }
    }

    fun loadJob() {
        viewModelScope.launch {
            _state.update { it.copy(jobLoading = true, jobError = null) }
            runCatching { api.getJob(jobId).data }
                .onSuccess { job ->
                    _state.update { it.copy(job = job, jobLoading = false) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(jobLoading = false, jobError = e.toApiException().message)
                    }
                }
        }
    }

    fun loadCandidates() {
        viewModelScope.launch {
            _state.update {
                it.copy(candidatesLoading = true, candidatesError = null, candidatesForbidden = false)
            }
            runCatching { api.listCandidates(jobId) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            candidates = resp.data ?: emptyList(),
                            candidatesLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    val apiErr = e.toApiException()
                    _state.update {
                        it.copy(
                            candidatesLoading = false,
                            candidatesForbidden = apiErr.httpStatus == 403,
                            candidatesError = if (apiErr.httpStatus == 403) {
                                null
                            } else {
                                apiErr.message
                            },
                        )
                    }
                }
        }
    }

    /** Đổi trạng thái ứng viên (đã qua hộp thoại xác nhận ở tầng UI). */
    fun changeStatus(candidate: CandidateDto, newStatus: String, note: String) {
        val id = candidate.id ?: return
        if (_state.value.actingId != null) return
        if (newStatus == candidate.status && note.trim() == (candidate.hrNote ?: "")) {
            _state.update { it.copy(message = "Trạng thái và ghi chú chưa thay đổi.") }
            return
        }
        _state.update { it.copy(actingId = id) }
        viewModelScope.launch {
            runCatching {
                api.updateCandidateStatus(
                    id,
                    CandidateStatusBody(
                        status = newStatus,
                        hrNote = note.trim().ifBlank { null },
                    ),
                ).data
            }.onSuccess { updated ->
                _state.update { s ->
                    s.copy(
                        actingId = null,
                        candidates = if (updated != null) {
                            s.candidates.map { if (it.id == id) updated else it }
                        } else {
                            s.candidates.map {
                                if (it.id == id) {
                                    it.copy(status = newStatus, hrNote = note.trim().ifBlank { null })
                                } else {
                                    it
                                }
                            }
                        },
                        message = "Đã chuyển ${candidate.fullName ?: "ứng viên"} " +
                            "sang trạng thái \"${candidateStatusLabel(newStatus)}\".",
                    )
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(actingId = null, message = e.toApiException().message)
                }
            }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: RecruitmentApi,
        private val sessionStore: SessionStore,
        private val jobId: Int,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            JobDetailViewModel(api, sessionStore, jobId) as T
    }
}
