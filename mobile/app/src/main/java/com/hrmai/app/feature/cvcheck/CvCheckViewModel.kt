package com.hrmai.app.feature.cvcheck

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.feature.jobs.JobPostingDto
import com.hrmai.app.feature.jobs.JobsApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Giới hạn độ dài CV phía server (cvcheck.MAX_CV_TEXT_CHARS). */
const val MAX_CV_CHARS = 12_000

data class CvCheckUiState(
    val jobsLoading: Boolean = true,
    val jobs: List<JobPostingDto> = emptyList(),
    val jobsError: String? = null,
    val selectedJobId: Int? = null,
    val cvText: String = "",
    val submitting: Boolean = false,
    val error: String? = null,
    val result: CvCheckResultDto? = null,
)

class CvCheckViewModel(
    private val jobsApi: JobsApi,
    private val cvCheckApi: CvCheckApi,
) : ViewModel() {
    private val _state = MutableStateFlow(CvCheckUiState())
    val state: StateFlow<CvCheckUiState> = _state

    init { loadJobs() }

    fun loadJobs() {
        _state.update { it.copy(jobsLoading = true, jobsError = null) }
        viewModelScope.launch {
            runCatching { jobsApi.listOpenJobs().data }
                .onSuccess { jobs ->
                    _state.update {
                        it.copy(
                            jobsLoading = false,
                            jobs = jobs,
                            selectedJobId = it.selectedJobId
                                ?: jobs.firstOrNull()?.id,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            jobsLoading = false,
                            jobsError = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun selectJob(jobId: Int) =
        _state.update { it.copy(selectedJobId = jobId, error = null) }

    fun onCvTextChange(text: String) =
        _state.update { it.copy(cvText = text, error = null) }

    fun submit() {
        val s = _state.value
        if (s.submitting) return
        val jobId = s.selectedJobId
        if (jobId == null) {
            _state.update { it.copy(error = "Bạn chọn một vị trí đang tuyển trước nhé.") }
            return
        }
        val text = s.cvText.trim()
        if (text.isEmpty()) {
            _state.update { it.copy(error = "Bạn dán nội dung CV vào ô bên trên nhé.") }
            return
        }
        if (text.length > MAX_CV_CHARS) {
            _state.update {
                it.copy(error = "CV quá dài (tối đa $MAX_CV_CHARS ký tự), rút gọn giúp em nhé.")
            }
            return
        }
        _state.update { it.copy(submitting = true, error = null, result = null) }
        viewModelScope.launch {
            runCatching { cvCheckApi.checkCv(CvCheckRequest(jobId, text)).data }
                .onSuccess { result ->
                    _state.update { it.copy(submitting = false, result = result) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            submitting = false,
                            error = e.toApiException().message,
                        )
                    }
                }
        }
    }

    class Factory(
        private val jobsApi: JobsApi,
        private val cvCheckApi: CvCheckApi,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            CvCheckViewModel(jobsApi, cvCheckApi) as T
    }
}
