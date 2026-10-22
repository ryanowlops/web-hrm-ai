package com.hrmai.app.feature.performance

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Hiệu suất / KPI-OKR (performance).
 * Field khớp server/app/blueprints/performance/schemas.py:
 * - GET cycles / objectives / reviews bọc trong { data }.
 * - POST key-results/{id}/check-in trả THẲNG object check-in (không bọc
 *   data), kèm objective_score + key_result đã tính lại tiến độ.
 * - Objective.score và Objective.progress_percent đều là điểm 0..100 do
 *   server tính (trung bình có trọng số tiến độ các Key Result).
 * - KeyResult.progress là tỉ lệ 0..1, progress_percent là 0..100.
 */

@JsonClass(generateAdapter = false)
data class PerfCycleDto(
    val id: Int? = null,
    val name: String? = null,
    @Json(name = "start_date") val startDate: String? = null,
    @Json(name = "end_date") val endDate: String? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = false)
data class PerfCyclesResponse(
    val data: List<PerfCycleDto>? = null,
)

@JsonClass(generateAdapter = false)
data class KeyResultDto(
    val id: Int? = null,
    @Json(name = "objective_id") val objectiveId: Int? = null,
    val title: String? = null,
    val unit: String? = null,
    @Json(name = "target_value") val targetValue: Double? = null,
    @Json(name = "current_value") val currentValue: Double? = null,
    val weight: Double? = null,
    val direction: String? = null,
    /** Tỉ lệ hoàn thành 0..1 (chỉ có khi server tính kèm). */
    val progress: Double? = null,
    /** Phần trăm hoàn thành 0..100. */
    @Json(name = "progress_percent") val progressPercent: Double? = null,
)

@JsonClass(generateAdapter = false)
data class ObjectiveDto(
    val id: Int? = null,
    @Json(name = "cycle_id") val cycleId: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    val title: String? = null,
    val description: String? = null,
    val weight: Double? = null,
    val status: String? = null,
    @Json(name = "created_by") val createdBy: Int? = null,
    @Json(name = "creator_name") val creatorName: String? = null,
    @Json(name = "key_results") val keyResults: List<KeyResultDto>? = null,
    /** Điểm mục tiêu 0..100 do server tính. */
    val score: Double? = null,
    /** Bằng score (0..100) — dùng cho thanh tiến độ của mục tiêu. */
    @Json(name = "progress_percent") val progressPercent: Double? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class ObjectivesResponse(
    val data: List<ObjectiveDto>? = null,
)

@JsonClass(generateAdapter = false)
data class PerfReviewDto(
    val id: Int? = null,
    @Json(name = "cycle_id") val cycleId: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "reviewer_id") val reviewerId: Int? = null,
    @Json(name = "reviewer_name") val reviewerName: String? = null,
    @Json(name = "review_type") val reviewType: String? = null,
    val score: Double? = null,
    val comment: String? = null,
    val status: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class PerfReviewsResponse(
    val data: List<PerfReviewDto>? = null,
)

@JsonClass(generateAdapter = false)
data class CheckinBody(
    @Json(name = "new_value") val newValue: Double,
    val note: String? = null,
)

/** Response của POST check-in: object trần (không bọc data), HTTP 201. */
@JsonClass(generateAdapter = false)
data class CheckinResponse(
    val id: Int? = null,
    @Json(name = "key_result_id") val keyResultId: Int? = null,
    @Json(name = "old_value") val oldValue: Double? = null,
    @Json(name = "new_value") val newValue: Double? = null,
    val note: String? = null,
    @Json(name = "objective_score") val objectiveScore: Double? = null,
    @Json(name = "key_result") val keyResult: KeyResultDto? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

interface PerformanceApi {
    @GET("performance/cycles")
    suspend fun getCycles(): PerfCyclesResponse

    @GET("performance/objectives")
    suspend fun getObjectives(
        @Query("employee_id") employeeId: Int?,
        @Query("cycle_id") cycleId: Int?,
    ): ObjectivesResponse

    @GET("performance/reviews")
    suspend fun getReviews(
        @Query("employee_id") employeeId: Int?,
        @Query("cycle_id") cycleId: Int?,
    ): PerfReviewsResponse

    @POST("performance/key-results/{id}/check-in")
    suspend fun checkIn(
        @Path("id") keyResultId: Int,
        @Body body: CheckinBody,
    ): CheckinResponse
}
