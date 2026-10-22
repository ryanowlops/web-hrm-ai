package com.hrmai.app.feature.teamcalendar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.core.util.Format
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

/** Một ngày trong tuần đang xem + những người nghỉ phép vào ngày đó. */
data class TeamDay(
    val date: LocalDate,
    val entries: List<TeamLeaveEntryDto>,
    val isToday: Boolean,
)

data class TeamCalendarUiState(
    /** Thứ Hai của tuần đang xem. */
    val weekStart: LocalDate,
    val selectedDate: LocalDate,
    val days: List<TeamDay> = emptyList(),
    /** Đơn nghỉ áp dụng cho ngày đang chọn. */
    val selectedEntries: List<TeamLeaveEntryDto> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    val forbidden: Boolean = false,
)

class TeamCalendarViewModel(
    private val api: TeamCalendarApi,
) : ViewModel() {

    private val today: LocalDate = Format.today()
    private val initialWeekStart: LocalDate =
        today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

    private val _state = MutableStateFlow(
        TeamCalendarUiState(
            weekStart = initialWeekStart,
            selectedDate = today,
        ),
    )
    val state: StateFlow<TeamCalendarUiState> = _state

    /** Cache đơn nghỉ theo tháng (khoá "YYYY-MM") để chuyển tuần mượt. */
    private val monthCache = mutableMapOf<String, List<TeamLeaveEntryDto>>()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, forbidden = false) }
            fetch()
        }
    }

    fun previousWeek() = shiftWeek(-1)

    fun nextWeek() = shiftWeek(1)

    fun goToToday() {
        _state.update { it.copy(weekStart = initialWeekStart, selectedDate = today) }
        load()
    }

    fun selectDate(date: LocalDate) {
        _state.update { it.copy(selectedDate = date) }
        rebuildDays()
    }

    private fun shiftWeek(deltaWeeks: Long) {
        val newStart = _state.value.weekStart.plusWeeks(deltaWeeks)
        val newSelected = _state.value.selectedDate.plusWeeks(deltaWeeks)
        _state.update {
            it.copy(weekStart = newStart, selectedDate = newSelected, loading = true)
        }
        viewModelScope.launch { fetch() }
    }

    private suspend fun fetch() {
        val weekStart = _state.value.weekStart
        val months = (0..6)
            .map { YearMonth.from(weekStart.plusDays(it.toLong())) }
            .distinct()
        val failedMonths = mutableListOf<String>()
        var forbidden = false
        var errorMessage: String? = null
        for (month in months) {
            val key = month.format(MONTH_FORMATTER)
            if (monthCache.containsKey(key)) continue
            runCatching { api.getCalendar(key) }
                .onSuccess { resp -> monthCache[key] = resp.data ?: emptyList() }
                .onFailure { e ->
                    val apiError = e.toApiException()
                    failedMonths += key
                    if (apiError.httpStatus == 403) forbidden = true
                    errorMessage = apiError.message
                }
        }
        val allLoaded = months.all { monthCache.containsKey(it.format(MONTH_FORMATTER)) }
        _state.update {
            it.copy(
                loading = false,
                error = if (allLoaded) null else errorMessage,
                forbidden = forbidden && !allLoaded,
            )
        }
        if (allLoaded || months.any { monthCache.containsKey(it.format(MONTH_FORMATTER)) }) {
            rebuildDays()
        }
    }

    private fun rebuildDays() {
        val s = _state.value
        val allEntries = monthCache.values.flatten()
        val days = (0..6).map { offset ->
            val date = s.weekStart.plusDays(offset.toLong())
            TeamDay(
                date = date,
                entries = allEntries
                    .filter { entry -> entry.covers(date) }
                    .sortedBy { it.employeeName ?: "" },
                isToday = date == today,
            )
        }
        _state.update {
            it.copy(
                days = days,
                selectedEntries = days.firstOrNull { day -> day.date == it.selectedDate }
                    ?.entries
                    ?: emptyList(),
            )
        }
    }

    class Factory(
        private val api: TeamCalendarApi,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            TeamCalendarViewModel(api) as T
    }

    companion object {
        private val MONTH_FORMATTER: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM")
    }
}

/** Đơn nghỉ (from_date..to_date, cả hai đầu) có phủ ngày [date] không. */
private fun TeamLeaveEntryDto.covers(date: LocalDate): Boolean {
    val from = Format.parseDate(fromDate) ?: return false
    val to = Format.parseDate(toDate) ?: from
    return !date.isBefore(from) && !date.isAfter(to)
}
