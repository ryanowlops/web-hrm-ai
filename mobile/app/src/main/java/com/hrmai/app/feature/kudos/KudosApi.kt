package com.hrmai.app.feature.kudos

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

// Nguồn shape:
// - Kudo: server/app/blueprints/engagement/schemas.py (kudo_to_dict).
// - Leaderboard kudos: engagement/services.py — { month, top_received,
//   top_givers } bọc trong { data: ... }.
// - Milestones: engagement/services.py — { month, birthdays, anniversaries }.
// - Điểm/huy hiệu/bảng điểm: gamification services — my-points trả
//   { balance, total_earned, total_spent, recent[] }; my-badges trả mảng
//   { key, name, emoji, description, earned, progress_text };
//   leaderboard trả mảng { employee{...}, department, total_earned, balance }.
// - Người nhận: GET employees (giống bản web — getEmployees({limit:100})).

@JsonClass(generateAdapter = false)
data class KudoDto(
    val id: Int? = null,
    @Json(name = "from_user_id") val fromUserId: Int? = null,
    @Json(name = "from_name") val fromName: String? = null,
    @Json(name = "from_employee_id") val fromEmployeeId: Int? = null,
    @Json(name = "to_employee_id") val toEmployeeId: Int? = null,
    @Json(name = "to_name") val toName: String? = null,
    @Json(name = "to_code") val toCode: String? = null,
    @Json(name = "to_department") val toDepartment: String? = null,
    val badge: String? = null,
    @Json(name = "badge_label") val badgeLabel: String? = null,
    val message: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class KudosResponse(
    val data: List<KudoDto>? = null,
)

@JsonClass(generateAdapter = false)
data class KudoResponse(
    val data: KudoDto? = null,
)

@JsonClass(generateAdapter = false)
data class PointsLedgerDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    val delta: Int? = null,
    @Json(name = "source_type") val sourceType: String? = null,
    @Json(name = "source_ref") val sourceRef: String? = null,
    val note: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class MyPointsDto(
    val balance: Int? = null,
    @Json(name = "total_earned") val totalEarned: Int? = null,
    @Json(name = "total_spent") val totalSpent: Int? = null,
    val recent: List<PointsLedgerDto>? = null,
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
data class KudosReceivedEntryDto(
    @Json(name = "employee_id") val employeeId: Int? = null,
    val name: String? = null,
    val code: String? = null,
    val department: String? = null,
    val count: Int? = null,
)

@JsonClass(generateAdapter = false)
data class KudosGiverEntryDto(
    @Json(name = "user_id") val userId: Int? = null,
    val name: String? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    val count: Int? = null,
)

@JsonClass(generateAdapter = false)
data class KudosLeaderboardDto(
    val month: String? = null,
    @Json(name = "top_received") val topReceived: List<KudosReceivedEntryDto>? = null,
    @Json(name = "top_givers") val topGivers: List<KudosGiverEntryDto>? = null,
)

@JsonClass(generateAdapter = false)
data class KudosLeaderboardResponse(
    val data: KudosLeaderboardDto? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeBriefDto(
    val id: Int? = null,
    val code: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "department_name") val departmentName: String? = null,
)

@JsonClass(generateAdapter = false)
data class PointsLeaderboardItemDto(
    val employee: EmployeeBriefDto? = null,
    val department: String? = null,
    @Json(name = "total_earned") val totalEarned: Int? = null,
    val balance: Int? = null,
)

@JsonClass(generateAdapter = false)
data class PointsLeaderboardResponse(
    val data: List<PointsLeaderboardItemDto>? = null,
)

@JsonClass(generateAdapter = false)
data class MilestoneItemDto(
    @Json(name = "employee_id") val employeeId: Int? = null,
    val name: String? = null,
    val code: String? = null,
    val department: String? = null,
    val type: String? = null,
    val day: Int? = null,
    val date: String? = null,
    @Json(name = "turning_age") val turningAge: Int? = null,
    val years: Int? = null,
)

@JsonClass(generateAdapter = false)
data class MilestonesDto(
    val month: String? = null,
    val birthdays: List<MilestoneItemDto>? = null,
    val anniversaries: List<MilestoneItemDto>? = null,
)

@JsonClass(generateAdapter = false)
data class MilestonesResponse(
    val data: MilestonesDto? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeOptionDto(
    val id: Int? = null,
    val code: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    @Json(name = "department_name") val departmentName: String? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeesResponse(
    val data: List<EmployeeOptionDto>? = null,
)

@JsonClass(generateAdapter = false)
data class CreateKudoRequest(
    @Json(name = "to_employee_id") val toEmployeeId: Int,
    val badge: String,
    val message: String,
)

/** Các loại huy hiệu kudos — khớp Kudo.BADGES phía server và nhãn bản web. */
object KudoBadges {
    val options: List<Pair<String, String>> = listOf(
        "teamwork" to "Đồng đội",
        "innovation" to "Sáng tạo",
        "dedication" to "Tận tâm",
        "leadership" to "Lãnh đạo",
        "thanks" to "Cảm ơn",
    )

    fun labelOf(value: String?): String =
        options.firstOrNull { it.first == value }?.second ?: "Cảm ơn"
}

interface KudosApi {
    @GET("engagement/kudos")
    suspend fun getKudos(): KudosResponse

    @POST("engagement/kudos")
    suspend fun createKudo(@Body body: CreateKudoRequest): KudoResponse

    @GET("engagement/kudos/leaderboard")
    suspend fun getKudosLeaderboard(): KudosLeaderboardResponse

    @GET("engagement/milestones")
    suspend fun getMilestones(): MilestonesResponse

    @GET("gamification/my-points")
    suspend fun getMyPoints(): MyPointsResponse

    @GET("gamification/my-badges")
    suspend fun getMyBadges(): MyBadgesResponse

    @GET("gamification/leaderboard")
    suspend fun getPointsLeaderboard(@Query("limit") limit: Int = 20): PointsLeaderboardResponse

    @GET("employees")
    suspend fun getEmployees(@Query("limit") limit: Int = 100): EmployeesResponse
}
