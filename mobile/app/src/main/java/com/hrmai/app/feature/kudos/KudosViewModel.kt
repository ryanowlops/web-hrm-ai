package com.hrmai.app.feature.kudos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class KudosUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val points: MyPointsDto? = null,
    val badges: List<BadgeDto> = emptyList(),
    val wall: List<KudoDto> = emptyList(),
    val boardTab: Int = 0,
    val kudosBoard: KudosLeaderboardDto? = null,
    val pointsBoard: List<PointsLeaderboardItemDto> = emptyList(),
    val milestones: MilestonesDto? = null,
    val employees: List<EmployeeOptionDto> = emptyList(),
    val employeesLoading: Boolean = false,
    val showGiveForm: Boolean = false,
    val showEmployeePicker: Boolean = false,
    val selectedEmployee: EmployeeOptionDto? = null,
    val badge: String = "thanks",
    val message: String = "",
    val giving: Boolean = false,
    val giveError: String? = null,
    val myEmployeeId: Int? = null,
    val toast: String? = null,
)

class KudosViewModel(
    private val api: KudosApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(KudosUiState())
    val state: StateFlow<KudosUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                _state.update { it.copy(myEmployeeId = session?.user?.employeeId) }
            }
        }
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val wallResult = runCatching { api.getKudos() }
            // Điểm/huy hiệu/bảng xếp hạng/cột mốc: lỗi riêng lẻ chỉ ẩn mục đó,
            // không chặn cả trang (vd. tài khoản chưa gắn hồ sơ nhân viên).
            val points = runCatching { api.getMyPoints().data }.getOrNull()
            val badges = runCatching { api.getMyBadges().data }.getOrNull()
            val kudosBoard = runCatching { api.getKudosLeaderboard().data }.getOrNull()
            val pointsBoard = runCatching { api.getPointsLeaderboard().data }.getOrNull()
            val milestones = runCatching { api.getMilestones().data }.getOrNull()
            wallResult
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            loading = false,
                            wall = resp.data ?: emptyList(),
                            points = points ?: it.points,
                            badges = badges ?: it.badges,
                            kudosBoard = kudosBoard ?: it.kudosBoard,
                            pointsBoard = pointsBoard ?: it.pointsBoard,
                            milestones = milestones ?: it.milestones,
                            error = null,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            loading = false,
                            points = points ?: it.points,
                            badges = badges ?: it.badges,
                            kudosBoard = kudosBoard ?: it.kudosBoard,
                            pointsBoard = pointsBoard ?: it.pointsBoard,
                            milestones = milestones ?: it.milestones,
                            error = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        _state.update { it.copy(refreshing = true) }
        viewModelScope.launch {
            val wallResult = runCatching { api.getKudos() }
            val points = runCatching { api.getMyPoints().data }.getOrNull()
            val kudosBoard = runCatching { api.getKudosLeaderboard().data }.getOrNull()
            val pointsBoard = runCatching { api.getPointsLeaderboard().data }.getOrNull()
            val milestones = runCatching { api.getMilestones().data }.getOrNull()
            _state.update { st ->
                st.copy(
                    refreshing = false,
                    wall = wallResult.getOrNull()?.data ?: st.wall,
                    points = points ?: st.points,
                    kudosBoard = kudosBoard ?: st.kudosBoard,
                    pointsBoard = pointsBoard ?: st.pointsBoard,
                    milestones = milestones ?: st.milestones,
                    toast = wallResult.exceptionOrNull()?.toApiException()?.message ?: st.toast,
                )
            }
        }
    }

    fun setBoardTab(tab: Int) = _state.update { it.copy(boardTab = tab) }

    // ---- Tặng kudos ----

    fun openGiveForm() {
        _state.update { it.copy(showGiveForm = true, giveError = null) }
        if (_state.value.employees.isEmpty()) loadEmployees()
    }

    fun closeGiveForm() = _state.update { it.copy(showGiveForm = false, giveError = null) }

    fun openEmployeePicker() {
        _state.update { it.copy(showEmployeePicker = true) }
        if (_state.value.employees.isEmpty()) loadEmployees()
    }

    fun closeEmployeePicker() = _state.update { it.copy(showEmployeePicker = false) }

    fun selectEmployee(employee: EmployeeOptionDto) {
        _state.update {
            it.copy(selectedEmployee = employee, showEmployeePicker = false, giveError = null)
        }
    }

    fun onBadgeChange(badge: String) = _state.update { it.copy(badge = badge) }

    fun onMessageChange(value: String) = _state.update { it.copy(message = value, giveError = null) }

    private fun loadEmployees() {
        if (_state.value.employeesLoading) return
        _state.update { it.copy(employeesLoading = true) }
        viewModelScope.launch {
            runCatching { api.getEmployees() }
                .onSuccess { resp ->
                    _state.update { st ->
                        val mine = st.myEmployeeId
                        st.copy(
                            employeesLoading = false,
                            employees = (resp.data ?: emptyList())
                                .filter { emp -> emp.id != null && emp.id != mine },
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            employeesLoading = false,
                            giveError = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun submitKudo() {
        val s = _state.value
        if (s.giving) return
        val recipient = s.selectedEmployee
        if (recipient?.id == null) {
            _state.update { it.copy(giveError = "Chọn người nhận kudos giúp em nhé.") }
            return
        }
        val message = s.message.trim()
        if (message.isBlank()) {
            _state.update { it.copy(giveError = "Viết vài lời nhắn gửi đồng nghiệp nhé.") }
            return
        }
        _state.update { it.copy(giving = true, giveError = null) }
        viewModelScope.launch {
            runCatching {
                api.createKudo(
                    CreateKudoRequest(
                        toEmployeeId = recipient.id,
                        badge = s.badge,
                        message = message,
                    )
                )
            }.onSuccess { resp ->
                val created = resp.data
                _state.update { st ->
                    st.copy(
                        giving = false,
                        showGiveForm = false,
                        selectedEmployee = null,
                        badge = "thanks",
                        message = "",
                        wall = if (created != null) listOf(created) + st.wall else st.wall,
                        toast = "Đã gửi kudos tới ${recipient.fullName ?: "đồng nghiệp"}",
                    )
                }
                // Làm mới bảng xếp hạng kudos sau khi tặng.
                runCatching { api.getKudosLeaderboard().data }.getOrNull()?.let { board ->
                    _state.update { it.copy(kudosBoard = board) }
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(giving = false, giveError = e.toApiException().message)
                }
            }
        }
    }

    fun consumeToast() = _state.update { it.copy(toast = null) }

    class Factory(
        private val api: KudosApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            KudosViewModel(api, sessionStore) as T
    }
}
