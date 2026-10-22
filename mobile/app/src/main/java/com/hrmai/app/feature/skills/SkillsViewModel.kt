package com.hrmai.app.feature.skills

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SkillsUiState(
    val myEmployeeId: Int? = null,
    /** null = tài khoản chưa gắn hồ sơ nhân viên (không tải được phần "của tôi"). */
    val sessionLoaded: Boolean = false,
    // Kỹ năng của tôi
    val myData: EmployeeSkillsDataDto? = null,
    val myLoading: Boolean = true,
    val myError: String? = null,
    // Gợi ý khoá học cho tôi
    val suggestions: List<CourseSuggestionDto> = emptyList(),
    /** "ai" | "keyword" từ meta của endpoint suggest. */
    val suggestSource: String? = null,
    val suggestionsLoading: Boolean = false,
    // Ma trận kỹ năng toàn công ty
    val matrix: MatrixDataDto? = null,
    val matrixLoading: Boolean = true,
    val matrixError: String? = null,
    /** Phòng ban đang chọn để xem tổng quan (null = chưa chọn/mặc định). */
    val selectedDepartmentId: Int? = null,
    val refreshing: Boolean = false,
)

class SkillsViewModel(
    private val api: SkillsApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(SkillsUiState())
    val state: StateFlow<SkillsUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val employeeId = session?.user?.employeeId
                val changed = _state.value.myEmployeeId != employeeId
                _state.update {
                    it.copy(myEmployeeId = employeeId, sessionLoaded = true)
                }
                if (changed && employeeId != null) {
                    fetchMine(employeeId)
                    fetchSuggestions(employeeId)
                }
                if (changed && employeeId == null) {
                    _state.update { it.copy(myLoading = false) }
                }
            }
        }
        loadMatrix()
    }

    // ------------------------------------------------------------------
    // Kỹ năng của tôi + gợi ý
    // ------------------------------------------------------------------
    private suspend fun fetchMine(employeeId: Int) {
        _state.update { it.copy(myLoading = true, myError = null) }
        runCatching { api.getEmployeeSkills(employeeId) }
            .onSuccess { resp ->
                _state.update {
                    it.copy(myData = resp.data, myLoading = false, myError = null)
                }
            }
            .onFailure { e ->
                val apiError = e.toApiException()
                _state.update {
                    it.copy(
                        myLoading = false,
                        // 404 = ngoài phạm vi xem (scope server) — nói thân thiện.
                        myError = if (apiError.httpStatus == 404) {
                            "Chưa xem được hồ sơ kỹ năng của bạn."
                        } else {
                            apiError.message
                        },
                    )
                }
            }
    }

    private suspend fun fetchSuggestions(employeeId: Int) {
        _state.update { it.copy(suggestionsLoading = true) }
        runCatching { api.suggestCourses(employeeId) }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        suggestions = resp.data ?: emptyList(),
                        suggestSource = resp.meta?.source,
                        suggestionsLoading = false,
                    )
                }
            }
            .onFailure {
                // Gợi ý là phần phụ — lỗi thì ẩn lặng lẽ, không chặn màn hình.
                _state.update { it.copy(suggestionsLoading = false) }
            }
    }

    fun retryMine() {
        val employeeId = _state.value.myEmployeeId ?: return
        viewModelScope.launch {
            fetchMine(employeeId)
            fetchSuggestions(employeeId)
        }
    }

    // ------------------------------------------------------------------
    // Ma trận theo phòng ban
    // ------------------------------------------------------------------
    fun loadMatrix() {
        viewModelScope.launch {
            _state.update { it.copy(matrixLoading = true, matrixError = null) }
            fetchMatrix()
        }
    }

    private suspend fun fetchMatrix() {
        runCatching { api.getMatrix() }
            .onSuccess { resp ->
                val data = resp.data
                _state.update { s ->
                    s.copy(
                        matrix = data,
                        matrixLoading = false,
                        matrixError = null,
                        // Mặc định chọn phòng ban đầu tiên nếu chưa chọn.
                        selectedDepartmentId = s.selectedDepartmentId
                            ?: data?.departments?.firstOrNull()?.id,
                    )
                }
            }
            .onFailure { e ->
                _state.update {
                    it.copy(
                        matrixLoading = false,
                        matrixError = e.toApiException().message,
                    )
                }
            }
    }

    fun selectDepartment(departmentId: Int) =
        _state.update { it.copy(selectedDepartmentId = departmentId) }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetchMatrix()
            _state.value.myEmployeeId?.let { fetchMine(it) }
            _state.update { it.copy(refreshing = false) }
        }
    }

    class Factory(
        private val api: SkillsApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            SkillsViewModel(api, sessionStore) as T
    }
}
