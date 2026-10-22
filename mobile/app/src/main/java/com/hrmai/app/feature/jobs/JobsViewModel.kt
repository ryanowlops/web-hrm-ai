package com.hrmai.app.feature.jobs

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class JobsListUiState(
    val loading: Boolean = true,
    val jobs: List<JobPostingDto> = emptyList(),
    val error: String? = null,
)

class JobsViewModel(private val api: JobsApi) : ViewModel() {
    private val _state = MutableStateFlow(JobsListUiState())
    val state: StateFlow<JobsListUiState> = _state

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { api.listOpenJobs().data }
                .onSuccess { jobs ->
                    _state.update { it.copy(loading = false, jobs = jobs, error = null) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(loading = false, error = e.toApiException().message)
                    }
                }
        }
    }

    class Factory(private val api: JobsApi) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            JobsViewModel(api) as T
    }
}

data class JobDetailUiState(
    val loading: Boolean = true,
    val job: JobPostingDto? = null,
    val error: String? = null,
)

class JobDetailViewModel(
    private val api: JobsApi,
    private val jobId: Int,
) : ViewModel() {
    private val _state = MutableStateFlow(JobDetailUiState())
    val state: StateFlow<JobDetailUiState> = _state

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { api.getJob(jobId).data }
                .onSuccess { job ->
                    _state.update { it.copy(loading = false, job = job, error = null) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(loading = false, error = e.toApiException().message)
                    }
                }
        }
    }

    class Factory(
        private val api: JobsApi,
        private val jobId: Int,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            JobDetailViewModel(api, jobId) as T
    }
}
