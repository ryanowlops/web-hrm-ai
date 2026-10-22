package com.hrmai.app.feature.training

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TrainingUiState(
    /** 0 = Tất cả khoá học, 1 = Khoá của tôi. */
    val tab: Int = 0,
    val role: String? = null,
    val myEmployeeId: Int? = null,
    // Danh sách khoá học
    val courses: List<CourseDto> = emptyList(),
    val coursesLoading: Boolean = true,
    val coursesError: String? = null,
    val coursesRefreshing: Boolean = false,
    // Ghi danh của tôi
    val mine: List<EnrollmentDto> = emptyList(),
    val mineLoading: Boolean = true,
    val mineError: String? = null,
    val mineRefreshing: Boolean = false,
    /** Id khoá học đang ghi danh (khoá nút riêng khoá đó). */
    val enrollingCourseId: Int? = null,
    /** Id ghi danh đang cập nhật tiến độ. */
    val updatingEnrollmentId: Int? = null,
    val message: String? = null,
)

class TrainingViewModel(
    private val api: TrainingApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(TrainingUiState())
    val state: StateFlow<TrainingUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                _state.update {
                    it.copy(
                        role = session?.user?.role,
                        myEmployeeId = session?.user?.employeeId,
                    )
                }
            }
        }
        loadCourses()
        loadMine()
    }

    // ------------------------------------------------------------------
    // Tải dữ liệu
    // ------------------------------------------------------------------
    fun loadCourses() {
        viewModelScope.launch {
            _state.update { it.copy(coursesLoading = true, coursesError = null) }
            fetchCourses()
        }
    }

    private suspend fun fetchCourses() {
        runCatching { api.getCourses() }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        courses = resp.data ?: emptyList(),
                        coursesLoading = false,
                        coursesError = null,
                    )
                }
            }
            .onFailure { e ->
                _state.update {
                    it.copy(
                        coursesLoading = false,
                        coursesError = e.toApiException().message,
                    )
                }
            }
    }

    fun refreshCourses() {
        if (_state.value.coursesRefreshing) return
        viewModelScope.launch {
            _state.update { it.copy(coursesRefreshing = true) }
            fetchCourses()
            _state.update { it.copy(coursesRefreshing = false) }
        }
    }

    fun loadMine() {
        viewModelScope.launch {
            _state.update { it.copy(mineLoading = true, mineError = null) }
            fetchMine()
        }
    }

    private suspend fun fetchMine() {
        runCatching { api.getMyCourses() }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        mine = resp.data ?: emptyList(),
                        mineLoading = false,
                        mineError = null,
                    )
                }
            }
            .onFailure { e ->
                _state.update {
                    it.copy(
                        mineLoading = false,
                        mineError = e.toApiException().message,
                    )
                }
            }
    }

    fun refreshMine() {
        if (_state.value.mineRefreshing) return
        viewModelScope.launch {
            _state.update { it.copy(mineRefreshing = true) }
            fetchMine()
            _state.update { it.copy(mineRefreshing = false) }
        }
    }

    fun selectTab(index: Int) = _state.update { it.copy(tab = index) }

    /** Ghi danh của một khoá (nếu tôi đã được gán). */
    fun enrollmentFor(courseId: Int?): EnrollmentDto? =
        _state.value.mine.firstOrNull { it.courseId == courseId }

    /** Server chỉ cho admin/hr ghi danh học viên (kể cả tự ghi danh chính mình);
     *  nhân viên/manager thường được HR gán khoá. */
    fun canSelfEnroll(): Boolean = _state.value.role in SELF_ENROLL_ROLES

    // ------------------------------------------------------------------
    // Thao tác
    // ------------------------------------------------------------------
    fun enrollCourse(course: CourseDto) {
        val courseId = course.id ?: return
        val employeeId = _state.value.myEmployeeId
        if (_state.value.enrollingCourseId != null) return
        if (!canSelfEnroll() || employeeId == null) {
            _state.update {
                it.copy(message = "Khoá học do HR gán cho học viên — bạn liên hệ HR để được đăng ký nhé.")
            }
            return
        }
        _state.update { it.copy(enrollingCourseId = courseId) }
        viewModelScope.launch {
            runCatching { api.enroll(courseId, EnrollBody(listOf(employeeId))) }
                .onSuccess { resp ->
                    val created = resp.meta?.created ?: 0
                    _state.update {
                        it.copy(
                            enrollingCourseId = null,
                            message = if (created > 0) {
                                "Đã đăng ký khoá học thành công."
                            } else {
                                "Bạn đã có trong danh sách khoá này rồi."
                            },
                            tab = if (created > 0) 1 else it.tab,
                        )
                    }
                    if (created > 0) {
                        fetchMine()
                        fetchCourses()
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            enrollingCourseId = null,
                            message = e.toApiException().message,
                        )
                    }
                }
        }
    }

    /** Bắt đầu học: assigned -> in_progress (giữ nguyên progress). */
    fun startLearning(enrollment: EnrollmentDto) =
        patchEnrollment(enrollment, UpdateEnrollmentBody(status = "in_progress"))

    /** Cập nhật tiến độ 0..100; 100% -> server tự chuyển completed. */
    fun updateProgress(enrollment: EnrollmentDto, progress: Int) =
        patchEnrollment(enrollment, UpdateEnrollmentBody(progress = progress.coerceIn(0, 100)))

    /** Đánh dấu hoàn thành: server tự đặt progress = 100. */
    fun markCompleted(enrollment: EnrollmentDto) =
        patchEnrollment(enrollment, UpdateEnrollmentBody(status = "completed"))

    private fun patchEnrollment(enrollment: EnrollmentDto, body: UpdateEnrollmentBody) {
        val id = enrollment.id ?: return
        if (_state.value.updatingEnrollmentId != null) return
        _state.update { it.copy(updatingEnrollmentId = id) }
        viewModelScope.launch {
            runCatching { api.updateEnrollment(id, body) }
                .onSuccess { resp ->
                    val updated = resp.data
                    _state.update { s ->
                        s.copy(
                            updatingEnrollmentId = null,
                            mine = if (updated != null) {
                                s.mine.map { if (it.id == id) updated else it }
                            } else {
                                s.mine
                            },
                            message = when (updated?.status) {
                                "completed" -> "Chúc mừng! Bạn đã hoàn thành khoá học."
                                else -> null
                            },
                        )
                    }
                    if (updated?.status == "completed") fetchCourses()
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            updatingEnrollmentId = null,
                            message = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: TrainingApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            TrainingViewModel(api, sessionStore) as T
    }

    companion object {
        private val SELF_ENROLL_ROLES = setOf("hr", "admin")

        const val STATUS_ASSIGNED = "assigned"
        const val STATUS_IN_PROGRESS = "in_progress"
        const val STATUS_COMPLETED = "completed"
    }
}
