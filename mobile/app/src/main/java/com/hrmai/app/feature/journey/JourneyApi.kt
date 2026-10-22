package com.hrmai.app.feature.journey

import com.hrmai.app.feature.kudos.MyBadgesResponse
import com.hrmai.app.feature.kudos.MyPointsResponse
import com.hrmai.app.feature.kudos.PointsLeaderboardResponse
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho "Hành trình của tôi".
 * - GET attendance/my-year?year=YYYY (blueprint attendance, services
 *   .get_my_year): { data: { year, days, summary } } — days chỉ chứa những
 *   ngày CÓ bản ghi chấm công; status thuộc present/late/absent/on_leave,
 *   check_in/check_out là ISO datetime hoặc null.
 * - Huy hiệu, bảng điểm và số dư dùng lại DTO + endpoint của gamification
 *   (giống feature kudos, tránh định nghĩa trùng).
 */

@JsonClass(generateAdapter = false)
data class JourneyDayDto(
    val date: String? = null,
    val status: String? = null,
    @Json(name = "check_in") val checkIn: String? = null,
    @Json(name = "check_out") val checkOut: String? = null,
)

@JsonClass(generateAdapter = false)
data class JourneySummaryDto(
    @Json(name = "total_days") val totalDays: Int? = null,
    @Json(name = "on_time_days") val onTimeDays: Int? = null,
    @Json(name = "late_days") val lateDays: Int? = null,
    @Json(name = "current_streak") val currentStreak: Int? = null,
    @Json(name = "best_streak") val bestStreak: Int? = null,
)

@JsonClass(generateAdapter = false)
data class JourneyYearDto(
    val year: Int? = null,
    val days: List<JourneyDayDto>? = null,
    val summary: JourneySummaryDto? = null,
)

@JsonClass(generateAdapter = false)
data class JourneyYearResponse(
    val data: JourneyYearDto? = null,
)

/** Nhãn trạng thái chấm công cho ô nhiệt + chi tiết ngày. */
object AttendanceDayStatus {
    const val PRESENT = "present"
    const val LATE = "late"
    const val ABSENT = "absent"
    const val ON_LEAVE = "on_leave"

    fun labelOf(status: String?): String = when (status) {
        PRESENT -> "Đúng giờ"
        LATE -> "Đi muộn"
        ABSENT -> "Vắng"
        ON_LEAVE -> "Nghỉ phép"
        else -> "Chưa có dữ liệu"
    }
}

interface JourneyApi {
    @GET("attendance/my-year")
    suspend fun getMyYear(@Query("year") year: Int): JourneyYearResponse

    @GET("gamification/my-points")
    suspend fun getMyPoints(): MyPointsResponse

    @GET("gamification/my-badges")
    suspend fun getMyBadges(): MyBadgesResponse

    @GET("gamification/leaderboard")
    suspend fun getPointsLeaderboard(@Query("limit") limit: Int = 50): PointsLeaderboardResponse
}
