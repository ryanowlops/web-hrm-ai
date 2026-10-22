package com.hrmai.app.feature.home

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Query

// ---------------------------------------------------------------------------
// DTO — field khớp serializer Flask (đối chiếu server/app/blueprints/*):
// - attendance/today: { data: record|null, has_checked_in, has_checked_out,
//   work_start_time } (attendance/routes.py).
// - leave/balance/me: { data: [ { leave_type_name, total_days, used_days,
//   remaining_days, ... } ] } (leave/schemas.balance_to_dict).
// - gamification/my-points: { data: { balance, total_earned, total_spent } }.
// - gamification/my-badges: { data: [ { key, name, emoji, earned, ... } ] }.
// - announcements: { data: [ { id, title, content, category, isPinned,
//   authorName, createdAt } ], meta } (announcements/schemas — camelCase).
// - feed/activity: { data: [ { type, actor_name, text, at, link } ] }.
// - notifications/unread-count: web đọc count | unread_count | unreadCount
//   (client/src/layouts/AppLayout.jsx); DTO chịu mọi biến thể.
// ---------------------------------------------------------------------------

@JsonClass(generateAdapter = false)
data class AttendanceRecordDto(
    val id: Int? = null,
    @Json(name = "work_date") val workDate: String? = null,
    @Json(name = "check_in_at") val checkInAt: String? = null,
    @Json(name = "check_out_at") val checkOutAt: String? = null,
    val status: String? = null,
    val note: String? = null,
)

@JsonClass(generateAdapter = false)
data class TodayAttendanceResponse(
    val data: AttendanceRecordDto? = null,
    @Json(name = "has_checked_in") val hasCheckedIn: Boolean? = null,
    @Json(name = "has_checked_out") val hasCheckedOut: Boolean? = null,
    @Json(name = "work_start_time") val workStartTime: String? = null,
)

@JsonClass(generateAdapter = false)
data class LeaveBalanceDto(
    val id: Int? = null,
    @Json(name = "leave_type_id") val leaveTypeId: Int? = null,
    @Json(name = "leave_type_name") val leaveTypeName: String? = null,
    val year: Int? = null,
    @Json(name = "total_days") val totalDays: Double? = null,
    @Json(name = "used_days") val usedDays: Double? = null,
    @Json(name = "remaining_days") val remainingDays: Double? = null,
)

@JsonClass(generateAdapter = false)
data class LeaveBalanceResponse(
    val data: List<LeaveBalanceDto>? = null,
)

@JsonClass(generateAdapter = false)
data class MyPointsDto(
    val balance: Int? = null,
    @Json(name = "total_earned") val totalEarned: Int? = null,
    @Json(name = "total_spent") val totalSpent: Int? = null,
)

@JsonClass(generateAdapter = false)
data class MyPointsResponse(
    val data: MyPointsDto? = null,
)

@JsonClass(generateAdapter = false)
data class BadgeDto(
    val key: String? = null,
    val name: String? = null,
    val emoji: String? = null,
    val description: String? = null,
    val earned: Boolean? = null,
    @Json(name = "progress_text") val progressText: String? = null,
)

@JsonClass(generateAdapter = false)
data class MyBadgesResponse(
    val data: List<BadgeDto>? = null,
)

@JsonClass(generateAdapter = false)
data class AnnouncementDto(
    val id: Int? = null,
    val title: String? = null,
    val content: String? = null,
    val category: String? = null,
    val isPinned: Boolean? = null,
    val authorName: String? = null,
    val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class AnnouncementsResponse(
    val data: List<AnnouncementDto>? = null,
)

@JsonClass(generateAdapter = false)
data class ActivityDto(
    val type: String? = null,
    @Json(name = "actor_name") val actorName: String? = null,
    val text: String? = null,
    val at: String? = null,
    val link: String? = null,
)

@JsonClass(generateAdapter = false)
data class ActivityResponse(
    val data: List<ActivityDto>? = null,
)

@JsonClass(generateAdapter = false)
data class UnreadCountData(
    val count: Int? = null,
    val unreadCount: Int? = null,
    @Json(name = "unread_count") val unreadCountSnake: Int? = null,
)

@JsonClass(generateAdapter = false)
data class UnreadCountResponse(
    val count: Int? = null,
    val unreadCount: Int? = null,
    @Json(name = "unread_count") val unreadCountSnake: Int? = null,
    val data: UnreadCountData? = null,
) {
    fun value(): Int? = count ?: unreadCount ?: unreadCountSnake
        ?: data?.count ?: data?.unreadCount ?: data?.unreadCountSnake
}

/** Dự phòng khi endpoint unread-count không có: list trả kèm unreadCount. */
@JsonClass(generateAdapter = false)
data class NotificationCountFallbackResponse(
    val unreadCount: Int? = null,
)

interface HomeApi {
    @GET("attendance/today")
    suspend fun todayAttendance(): TodayAttendanceResponse

    @GET("leave/balance/me")
    suspend fun myLeaveBalances(): LeaveBalanceResponse

    @GET("gamification/my-points")
    suspend fun myPoints(): MyPointsResponse

    @GET("gamification/my-badges")
    suspend fun myBadges(): MyBadgesResponse

    @GET("announcements")
    suspend fun announcements(@Query("limit") limit: Int = 5): AnnouncementsResponse

    @GET("feed/activity")
    suspend fun activity(@Query("limit") limit: Int = 10): ActivityResponse

    @GET("notifications/unread-count")
    suspend fun unreadCount(): UnreadCountResponse

    @GET("notifications")
    suspend fun notificationsCountFallback(@Query("limit") limit: Int = 1): NotificationCountFallbackResponse
}
