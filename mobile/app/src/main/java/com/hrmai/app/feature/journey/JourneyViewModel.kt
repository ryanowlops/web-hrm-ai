package com.hrmai.app.feature.journey

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.core.util.Format
import com.hrmai.app.feature.kudos.BadgeDto
import com.hrmai.app.feature.kudos.MyPointsDto
import com.hrmai.app.feature.kudos.PointsLeaderboardItemDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

data class JourneyUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    /** Năm đang xem trên bản đồ nhiệt (mặc định năm hiện tại). */
    val year: Int = Format.today().year,
    val yearData: JourneyYearDto? = null,
    /** Ngày được chạm trên lưới nhiệt để xem chi tiết. */
    val selectedDate: LocalDate? = null,
    val selectedDay: JourneyDayDto? = null,
    val points: MyPointsDto? = null,
    val badges: List<BadgeDto> = emptyList(),
    val leaderboard: List<PointsLeaderboardItemDto> = emptyList(),
    val myEmployeeId: Int? = null,
    /** Hạng của tôi trên bảng điểm (1-based); null nếu chưa có trong top. */
    val myRank: Int? = null,
    val toast: String? = null,
)

class JourneyViewModel(
    private val api: JourneyApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(JourneyUiState())
    val state: StateFlow<JourneyUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val myId = session?.user?.employeeId
                _state.update { st ->
                    st.copy(
                        myEmployeeId = myId,
                        myRank = computeRank(st.leaderboard, myId),
                    )
                }
            }
        }
        load()
    }

    private fun computeRank(
        board: List<PointsLeaderboardItemDto>,
        myId: Int?,
    ): Int? {
        if (myId == null) return null
        val index = board.indexOfFirst { it.employee?.id == myId }
        return if (index >= 0) index + 1 else null
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch { fetchAll(isRefresh = false) }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        _state.update { it.copy(refreshing = true) }
        viewModelScope.launch { fetchAll(isRefresh = true) }
    }

    private suspend fun fetchAll(isRefresh: Boolean) {
        val year = _state.value.year
        val yearResult = runCatching { api.getMyYear(year) }
        // Điểm/huy hiệu/bảng xếp hạng là dữ liệu phụ: lỗi riêng lẻ thì giữ
        // dữ liệu cũ (hoặc ẩn mục), không chặn bản đồ nhiệt.
        val points = runCatching { api.getMyPoints().data }.getOrNull()
        val badges = runCatching { api.getMyBadges().data }.getOrNull()
        val board = runCatching { api.getPointsLeaderboard().data }.getOrNull()
        yearResult
            .onSuccess { resp ->
                _state.update { st ->
                    st.copy(
                        loading = false,
                        refreshing = false,
                        error = null,
                        yearData = resp.data ?: st.yearData,
                        points = points ?: st.points,
                        badges = badges ?: st.badges,
                        leaderboard = board ?: st.leaderboard,
                        myRank = computeRank(board ?: st.leaderboard, st.myEmployeeId),
                    )
                }
            }
            .onFailure { e ->
                _state.update { st ->
                    st.copy(
                        loading = false,
                        refreshing = false,
                        points = points ?: st.points,
                        badges = badges ?: st.badges,
                        leaderboard = board ?: st.leaderboard,
                        myRank = computeRank(board ?: st.leaderboard, st.myEmployeeId),
                        error = if (isRefresh) st.error else e.toApiException().message,
                        toast = if (isRefresh) e.toApiException().message else st.toast,
                    )
                }
            }
    }

    /** Đổi năm xem bản đồ nhiệt (không cho vượt quá năm hiện tại). */
    fun changeYear(delta: Int) {
        val target = _state.value.year + delta
        if (target > Format.today().year || target < 2000) return
        _state.update {
            it.copy(year = target, selectedDate = null, selectedDay = null)
        }
        load()
    }

    fun selectDay(date: LocalDate, day: JourneyDayDto?) {
        _state.update { it.copy(selectedDate = date, selectedDay = day) }
    }

    fun consumeToast() = _state.update { it.copy(toast = null) }

    class Factory(
        private val api: JourneyApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            JourneyViewModel(api, sessionStore) as T
    }
}
