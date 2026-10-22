package com.hrmai.app.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.ApiException
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class OnboardingUiState(
    /** 0 = Của tôi, 1 = Nhân viên mới (chỉ quản lý/HR/admin). */
    val tab: Int = 0,
    val role: String? = null,
    val canSeePlans: Boolean = false,
    // Tab "Của tôi"
    val myPlan: OnboardingPlanDto? = null,
    val myPlanLoaded: Boolean = false,
    val myTasks: List<OnboardingTaskDto> = emptyList(),
    val myLoading: Boolean = true,
    val myError: String? = null,
    /** 403 ở tab Của tôi (tài khoản chưa gắn hồ sơ nhân viên...). */
    val myForbidden: Boolean = false,
    val myRefreshing: Boolean = false,
    // Tab "Nhân viên mới"
    val plans: List<OnboardingPlanDto> = emptyList(),
    val plansLoading: Boolean = false,
    val plansError: String? = null,
    val plansForbidden: Boolean = false,
    val plansRefreshing: Boolean = false,
    val detailPlan: OnboardingPlanDto? = null,
    val detailLoading: Boolean = false,
    val detailError: String? = null,
    /** Id task đang cập nhật trạng thái (khoá riêng task đó). */
    val actingTaskId: Int? = null,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
)

class OnboardingViewModel(
    private val api: OnboardingApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(OnboardingUiState())
    val state: StateFlow<OnboardingUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                if (_state.value.role != role) {
                    _state.update {
                        it.copy(role = role, canSeePlans = role in PLANS_ROLES)
                    }
                }
            }
        }
        loadMine()
    }

    // ------------------------------------------------------------------
    // Tab "Của tôi": kế hoạch của tôi + mọi task được giao cho tôi
    // ------------------------------------------------------------------
    fun loadMine() {
        viewModelScope.launch {
            _state.update { it.copy(myLoading = true, myError = null, myForbidden = false) }
            fetchMine()
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

    private suspend fun fetchMine() {
        var plan: OnboardingPlanDto? = null
        var planError: ApiException? = null
        runCatching { api.getMyPlan() }
            .onSuccess { plan = it.data }
            .onFailure { planError = it.toApiException() }
        runCatching { api.getMyTasks() }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        myPlan = plan,
                        myPlanLoaded = true,
                        myTasks = resp.data ?: emptyList(),
                        myLoading = false,
                        myError = null,
                        myForbidden = false,
                    )
                }
            }
            .onFailure { e ->
                val ex = e.toApiException()
                _state.update {
                    it.copy(
                        myPlan = plan,
                        myPlanLoaded = true,
                        myLoading = false,
                        myError = if (ex.httpStatus == 403) null else ex.message,
                        myForbidden = ex.httpStatus == 403 ||
                            planError?.httpStatus == 403,
                    )
                }
            }
    }

    // ------------------------------------------------------------------
    // Đánh dấu hoàn thành / mở lại task (dùng cho cả 2 tab)
    // ------------------------------------------------------------------
    /**
     * Tick task: chưa xong -> "done"; đã "done" -> mở lại "pending".
     * Task "verified" do HR xác nhận — không tự bỏ tick được ở phía app.
     * Dựa trên stored_status vì status hiển thị có thể là "overdue".
     */
    fun toggleTask(task: OnboardingTaskDto) {
        val id = task.id ?: return
        if (_state.value.actingTaskId != null) return
        val stored = task.storedStatus ?: task.status
        if (stored == "verified") {
            _state.update {
                it.copy(message = "Việc này đã được HR xác nhận, bạn không cần thao tác thêm.")
            }
            return
        }
        if (stored == "skipped") {
            _state.update { it.copy(message = "Việc này đã được bỏ qua trong kế hoạch.") }
            return
        }
        val newStatus = if (stored == "done") "pending" else "done"
        _state.update { it.copy(actingTaskId = id) }
        viewModelScope.launch {
            runCatching {
                api.updateTask(id, UpdateOnboardingTaskBody(status = newStatus))
            }.onSuccess {
                _state.update {
                    it.copy(
                        actingTaskId = null,
                        message = if (newStatus == "done") {
                            "Đã đánh dấu hoàn thành. Tốt lắm!"
                        } else {
                            "Đã mở lại việc này."
                        },
                    )
                }
                fetchMine()
                _state.value.detailPlan?.id?.let { openPlan(it, silent = true) }
                if (_state.value.canSeePlans) fetchPlans()
            }.onFailure { e ->
                _state.update {
                    it.copy(actingTaskId = null, message = e.toApiException().message)
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Tab "Nhân viên mới": danh sách plan + chi tiết
    // ------------------------------------------------------------------
    fun selectTab(index: Int) {
        if (index == 1 && !_state.value.canSeePlans) return
        _state.update { it.copy(tab = index) }
        if (index == 1 && _state.value.plans.isEmpty()) loadPlans()
    }

    fun loadPlans() {
        if (!_state.value.canSeePlans) return
        viewModelScope.launch {
            _state.update {
                it.copy(plansLoading = true, plansError = null, plansForbidden = false)
            }
            fetchPlans()
        }
    }

    fun refreshPlans() {
        if (_state.value.plansRefreshing || !_state.value.canSeePlans) return
        viewModelScope.launch {
            _state.update { it.copy(plansRefreshing = true) }
            fetchPlans()
            _state.update { it.copy(plansRefreshing = false) }
        }
    }

    private suspend fun fetchPlans() {
        runCatching { api.getPlans() }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        plans = resp.data ?: emptyList(),
                        plansLoading = false,
                        plansError = null,
                        plansForbidden = false,
                    )
                }
            }
            .onFailure { e ->
                val ex = e.toApiException()
                _state.update {
                    it.copy(
                        plansLoading = false,
                        plansError = if (ex.httpStatus == 403) null else ex.message,
                        plansForbidden = ex.httpStatus == 403,
                    )
                }
            }
    }

    fun openPlan(planId: Int, silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) {
                _state.update {
                    it.copy(detailLoading = true, detailError = null, detailPlan = null)
                }
            }
            runCatching { api.getPlanDetail(planId) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            detailPlan = resp.data,
                            detailLoading = false,
                            detailError = if (resp.data == null) {
                                "Không tìm thấy kế hoạch hội nhập."
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

    fun closePlan() = _state.update { it.copy(detailPlan = null, detailError = null) }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: OnboardingApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            OnboardingViewModel(api, sessionStore) as T
    }

    companion object {
        private val PLANS_ROLES = setOf("manager", "hr", "admin")
    }
}

/** Việc được coi là đã xong (kể cả đã được HR xác nhận). */
internal fun OnboardingTaskDto.isDone(): Boolean =
    (storedStatus ?: status) in setOf("done", "verified")
