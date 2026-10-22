package com.hrmai.app.feature.offboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class OffboardingUiState(
    val role: String? = null,
    /** Chỉ HR / quản lý / admin mới vào được dữ liệu nghỉ việc. */
    val canAccess: Boolean = false,
    val roleKnown: Boolean = false,
    // Danh sách quy trình
    val processes: List<OffboardingProcessDto> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    /** Server trả 403 (vai trò không đủ quyền dù app đã chặn trước). */
    val forbidden: Boolean = false,
    val refreshing: Boolean = false,
    // Chi tiết 1 quy trình
    val detail: OffboardingProcessDto? = null,
    val detailLoading: Boolean = false,
    val detailError: String? = null,
    /** Id task đang tick (khoá riêng task đó). */
    val actingTaskId: Int? = null,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
)

class OffboardingViewModel(
    private val api: OffboardingApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(OffboardingUiState())
    val state: StateFlow<OffboardingUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                if (role != null && _state.value.role != role) {
                    val canAccess = role in ACCESS_ROLES
                    _state.update {
                        it.copy(role = role, canAccess = canAccess, roleKnown = true)
                    }
                    if (canAccess) loadProcesses()
                }
            }
        }
    }

    fun loadProcesses() {
        if (!_state.value.canAccess) return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, forbidden = false) }
            fetchProcesses()
        }
    }

    fun refresh() {
        if (_state.value.refreshing || !_state.value.canAccess) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetchProcesses()
            _state.update { it.copy(refreshing = false) }
        }
    }

    private suspend fun fetchProcesses() {
        runCatching { api.getProcesses(status = null) }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        processes = resp.data ?: emptyList(),
                        loading = false,
                        error = null,
                        forbidden = false,
                    )
                }
            }
            .onFailure { e ->
                val ex = e.toApiException()
                _state.update {
                    it.copy(
                        loading = false,
                        error = if (ex.httpStatus == 403) null else ex.message,
                        forbidden = ex.httpStatus == 403,
                    )
                }
            }
    }

    fun openProcess(processId: Int, silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) {
                _state.update {
                    it.copy(detailLoading = true, detailError = null, detail = null)
                }
            }
            runCatching { api.getProcessDetail(processId) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            detail = resp.data,
                            detailLoading = false,
                            detailError = if (resp.data == null) {
                                "Không tìm thấy quy trình nghỉ việc."
                            } else {
                                null
                            },
                        )
                    }
                }
                .onFailure { e ->
                    if (!silent) {
                        _state.update {
                            it.copy(
                                detailLoading = false,
                                detailError = e.toApiException().message,
                            )
                        }
                    }
                }
        }
    }

    fun closeProcess() = _state.update { it.copy(detail = null, detailError = null) }

    /** Tick / bỏ tick một bước bàn giao: PATCH { is_done }. */
    fun toggleTask(task: OffboardingTaskDto) {
        val id = task.id ?: return
        if (_state.value.actingTaskId != null) return
        val process = _state.value.detail
        if (process?.status != "in_progress") {
            _state.update {
                it.copy(message = "Quy trình đã kết thúc nên không sửa checklist được nữa.")
            }
            return
        }
        val newDone = !(task.isDone ?: false)
        _state.update { it.copy(actingTaskId = id) }
        viewModelScope.launch {
            runCatching {
                api.updateTask(id, UpdateOffboardingTaskBody(isDone = newDone))
            }.onSuccess {
                _state.update {
                    it.copy(
                        actingTaskId = null,
                        message = if (newDone) {
                            "Đã tick hoàn thành bước bàn giao."
                        } else {
                            "Đã bỏ tick bước bàn giao."
                        },
                    )
                }
                process.id?.let { openProcess(it, silent = true) }
                fetchProcesses()
            }.onFailure { e ->
                _state.update {
                    it.copy(actingTaskId = null, message = e.toApiException().message)
                }
            }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: OffboardingApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            OffboardingViewModel(api, sessionStore) as T
    }

    companion object {
        private val ACCESS_ROLES = setOf("manager", "hr", "admin")
    }
}
