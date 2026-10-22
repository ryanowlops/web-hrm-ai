package com.hrmai.app.feature.rewards

import com.hrmai.app.feature.kudos.EmployeeBriefDto
import com.hrmai.app.feature.kudos.MyPointsResponse
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho Cửa hàng đổi thưởng (blueprint gamification).
 * Shape theo server/app/blueprints/gamification/schemas.py:
 * - GET rewards: { data: [Reward] } — mỗi quà có sẵn affordable/in_stock
 *   tính theo số dư của người gọi.
 * - POST redemptions: { data: Redemption } (201). Điểm CHƯA bị trừ —
 *   chỉ trừ khi HR/Admin duyệt (services.decide_redemption).
 * - GET redemptions: { data: [Redemption], meta: { page, limit, total,
 *   total_pages } } — lưu ý meta ở đây là snake_case, khác module users.
 * Số dư điểm dùng lại DTO của feature kudos (cùng endpoint my-points).
 */

@JsonClass(generateAdapter = false)
data class RewardDto(
    val id: Int? = null,
    val name: String? = null,
    val description: String? = null,
    @Json(name = "points_cost") val pointsCost: Int? = null,
    /** null = không giới hạn tồn kho. */
    val stock: Int? = null,
    @Json(name = "image_emoji") val imageEmoji: String? = null,
    @Json(name = "is_active") val isActive: Boolean? = null,
    @Json(name = "in_stock") val inStock: Boolean? = null,
    /** Server tính theo số dư hiện tại (chỉ có ở GET /rewards). */
    val affordable: Boolean? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class RewardsResponse(
    val data: List<RewardDto>? = null,
)

@JsonClass(generateAdapter = false)
data class RedemptionRewardBriefDto(
    val id: Int? = null,
    val name: String? = null,
    @Json(name = "image_emoji") val imageEmoji: String? = null,
)

@JsonClass(generateAdapter = false)
data class RedemptionDto(
    val id: Int? = null,
    val employee: EmployeeBriefDto? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    val reward: RedemptionRewardBriefDto? = null,
    @Json(name = "reward_id") val rewardId: Int? = null,
    @Json(name = "points_cost") val pointsCost: Int? = null,
    /** pending | approved | rejected */
    val status: String? = null,
    @Json(name = "decided_by") val decidedBy: Int? = null,
    @Json(name = "decided_at") val decidedAt: String? = null,
    val note: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class RedemptionsMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val total: Int? = null,
    @Json(name = "total_pages") val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class RedemptionsResponse(
    val data: List<RedemptionDto>? = null,
    val meta: RedemptionsMeta? = null,
)

@JsonClass(generateAdapter = false)
data class RedemptionResponse(
    val data: RedemptionDto? = null,
)

@JsonClass(generateAdapter = false)
data class CreateRedemptionRequest(
    @Json(name = "reward_id") val rewardId: Int,
)

/** Nhãn + màu trạng thái yêu cầu đổi quà, dùng chung trong package. */
object RedemptionStatus {
    const val PENDING = "pending"
    const val APPROVED = "approved"
    const val REJECTED = "rejected"

    fun labelOf(status: String?): String = when (status) {
        APPROVED -> "Đã duyệt"
        REJECTED -> "Đã từ chối"
        else -> "Chờ duyệt"
    }
}

interface RewardsApi {
    @GET("gamification/my-points")
    suspend fun getMyPoints(): MyPointsResponse

    @GET("gamification/rewards")
    suspend fun getRewards(): RewardsResponse

    @GET("gamification/redemptions")
    suspend fun getMyRedemptions(
        @Query("scope") scope: String = "mine",
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): RedemptionsResponse

    @POST("gamification/redemptions")
    suspend fun createRedemption(@Body body: CreateRedemptionRequest): RedemptionResponse
}
