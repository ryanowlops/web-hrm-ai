package com.hrmai.app.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.datastore.SessionUser
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Trạng thái của một khối dữ liệu độc lập trên trang chủ. */
sealed interface Block<out T> {
    data object Loading : Block<Nothing>
    data class Content<T>(val value: T) : Block<T>
    data class Failed(val message: String) : Block<Nothing>
}

data class HomeUiState(
    val user: SessionUser? = null,
    val unreadCount: Int = 0,
    val today: Block<TodayAttendanceResponse> = Block.Loading,
    val leaveBalances: Block<List<LeaveBalanceDto>> = Block.Loading,
    val points: Block<MyPointsDto> = Block.Loading,
    val latestBadge: Block<BadgeDto?> = Block.Loading,
    val announcements: Block<List<AnnouncementDto>> = Block.Loading,
    val activity: Block<List<ActivityDto>> = Block.Loading,
    val refreshing: Boolean = false,
) {
    /** Còn đang tải lần đầu (ít nhất một khối chưa có kết quả). */
    val initialLoading: Boolean
        get() = today is Block.Loading || leaveBalances is Block.Loading ||
            points is Block.Loading || announcements is Block.Loading ||
            activity is Block.Loading

    /** Tổng số ngày phép còn lại (cộng mọi loại phép có remaining_days). */
    val totalLeaveRemaining: Double?
        get() = (leaveBalances as? Block.Content)?.value
            ?.sumOf { it.remainingDays ?: 0.0 }
}

class HomeViewModel(
    private val api: HomeApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                _state.update { it.copy(user = session?.user) }
            }
        }
        loadAll()
    }

    fun refresh() {
        if (_state.value.refreshing) return
        _state.update { it.copy(refreshing = true) }
        loadAll { _state.update { s -> s.copy(refreshing = false) } }
    }

    /** Mỗi khối tải trong coroutine riêng — một khối lỗi không kéo sập trang. */
    private fun loadAll(onDone: () -> Unit = {}) {
        viewModelScope.launch {
            coroutineScope {
                val jobs = listOf(
                    async { loadToday() },
                    async { loadLeaveBalances() },
                    async { loadPoints() },
                    async { loadLatestBadge() },
                    async { loadAnnouncements() },
                    async { loadActivity() },
                    async { loadUnreadCount() },
                )
                jobs.awaitAll()
            }
            onDone()
        }
    }

    private suspend fun loadToday() {
        runCatching { api.todayAttendance() }
            .onSuccess { resp -> _state.update { it.copy(today = Block.Content(resp)) } }
            .onFailure { e ->
                _state.update {
                    it.copy(today = Block.Failed(friendlyMessage(e)))
                }
            }
    }

    private suspend fun loadLeaveBalances() {
        runCatching { api.myLeaveBalances().data ?: emptyList() }
            .onSuccess { list -> _state.update { it.copy(leaveBalances = Block.Content(list)) } }
            .onFailure { e ->
                _state.update { it.copy(leaveBalances = Block.Failed(friendlyMessage(e))) }
            }
    }

    private suspend fun loadPoints() {
        runCatching { api.myPoints().data ?: MyPointsDto(balance = 0) }
            .onSuccess { dto -> _state.update { it.copy(points = Block.Content(dto)) } }
            .onFailure { e ->
                _state.update { it.copy(points = Block.Failed(friendlyMessage(e))) }
            }
    }

    private suspend fun loadLatestBadge() {
        runCatching { api.myBadges().data ?: emptyList() }
            .onSuccess { badges ->
                // "Huy hiệu gần nhất": huy hiệu đã đạt nằm cuối danh sách đã đạt.
                val latest = badges.lastOrNull { it.earned == true }
                _state.update { it.copy(latestBadge = Block.Content(latest)) }
            }
            .onFailure { e ->
                _state.update { it.copy(latestBadge = Block.Failed(friendlyMessage(e))) }
            }
    }

    private suspend fun loadAnnouncements() {
        runCatching { api.announcements().data ?: emptyList() }
            .onSuccess { list ->
                _state.update { it.copy(announcements = Block.Content(list.take(3))) }
            }
            .onFailure { e ->
                _state.update { it.copy(announcements = Block.Failed(friendlyMessage(e))) }
            }
    }

    private suspend fun loadActivity() {
        runCatching { api.activity().data ?: emptyList() }
            .onSuccess { list -> _state.update { it.copy(activity = Block.Content(list)) } }
            .onFailure { e ->
                _state.update { it.copy(activity = Block.Failed(friendlyMessage(e))) }
            }
    }

    private suspend fun loadUnreadCount() {
        val primary = runCatching { api.unreadCount().value() }.getOrNull()
        val count = primary
            ?: runCatching { api.notificationsCountFallback().unreadCount }.getOrNull()
            ?: 0
        _state.update { it.copy(unreadCount = count) }
    }

    private fun friendlyMessage(e: Throwable): String = e.toApiException().message

    class Factory(
        private val api: HomeApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            HomeViewModel(api, sessionStore) as T
    }
}
