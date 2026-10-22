package com.hrmai.app.feature.briefing

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho Báo cáo điều hành AI (v6 mục 4.2).
 * Field khớp server/app/blueprints/briefing/schemas.py (briefing_to_dict)
 * và services.py (collect_numbers) — đã đối chiếu trực tiếp:
 * - Mọi endpoint bọc trong { data } (history thêm { meta }).
 * - numbers.period_start/period_end cũng được đưa lên top-level của briefing.
 * - attendance.on_time_rate là số thập phân (round 1 chữ số) hoặc null khi
 *   kỳ chưa có bản ghi chấm công nào.
 * - engagement.enps là null khi chưa có khảo sát eNPS có điểm; khi có:
 *   score là số nguyên (round %), responses là tổng số phản hồi.
 * - attrition_window_days = 60 (WINDOW_DAYS ở people_ai/services.py).
 */

@JsonClass(generateAdapter = false)
data class EnpsDto(
    val score: Int? = null,
    @Json(name = "survey_id") val surveyId: Int? = null,
    @Json(name = "survey_title") val surveyTitle: String? = null,
    val responses: Int? = null,
)

@JsonClass(generateAdapter = false)
data class BriefingAttendanceDto(
    @Json(name = "total_records") val totalRecords: Int? = null,
    val present: Int? = null,
    val late: Int? = null,
    val absent: Int? = null,
    @Json(name = "on_leave") val onLeave: Int? = null,
    @Json(name = "on_time_rate") val onTimeRate: Double? = null,
)

@JsonClass(generateAdapter = false)
data class BriefingLeaveDto(
    @Json(name = "pending_requests") val pendingRequests: Int? = null,
    @Json(name = "approved_in_period") val approvedInPeriod: Int? = null,
)

@JsonClass(generateAdapter = false)
data class BriefingRecruitmentDto(
    @Json(name = "open_job_postings") val openJobPostings: Int? = null,
    @Json(name = "new_candidates") val newCandidates: Int? = null,
)

@JsonClass(generateAdapter = false)
data class BriefingEngagementDto(
    @Json(name = "kudos_in_period") val kudosInPeriod: Int? = null,
    val enps: EnpsDto? = null,
)

@JsonClass(generateAdapter = false)
data class BriefingNumbersDto(
    val period: String? = null,
    @Json(name = "ref_date") val refDate: String? = null,
    @Json(name = "period_start") val periodStart: String? = null,
    @Json(name = "period_end") val periodEnd: String? = null,
    @Json(name = "headcount_total") val headcountTotal: Int? = null,
    @Json(name = "new_hires") val newHires: Int? = null,
    val departures: Int? = null,
    val attendance: BriefingAttendanceDto? = null,
    val leave: BriefingLeaveDto? = null,
    val recruitment: BriefingRecruitmentDto? = null,
    val engagement: BriefingEngagementDto? = null,
    @Json(name = "attrition_high_risk") val attritionHighRisk: Int? = null,
    @Json(name = "attrition_window_days") val attritionWindowDays: Int? = null,
)

@JsonClass(generateAdapter = false)
data class BriefingDto(
    val id: Int? = null,
    val period: String? = null,
    @Json(name = "ref_date") val refDate: String? = null,
    @Json(name = "period_start") val periodStart: String? = null,
    @Json(name = "period_end") val periodEnd: String? = null,
    val numbers: BriefingNumbersDto? = null,
    val prose: String? = null,
    /** "ai" = AI viết (đã qua hậu kiểm số), "template" = bản mẫu tự động. */
    val source: String? = null,
    @Json(name = "created_by") val createdBy: Int? = null,
    @Json(name = "created_by_name") val createdByName: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class BriefingResponse(
    val data: BriefingDto? = null,
)

@JsonClass(generateAdapter = false)
data class BriefingHistoryMeta(
    val totalItems: Int? = null,
    val limit: Int? = null,
    val period: String? = null,
)

@JsonClass(generateAdapter = false)
data class BriefingHistoryResponse(
    val data: List<BriefingDto>? = null,
    val meta: BriefingHistoryMeta? = null,
)

@JsonClass(generateAdapter = false)
data class GenerateBriefingBody(
    val period: String,
    @Json(name = "ref_date") val refDate: String? = null,
)

interface BriefingApi {
    /** Tạo báo cáo mới cho kỳ — server gom số thật rồi nhờ AI viết (hoặc
     *  rơi xuống template); có thể chậm 10–60s trên bản free. */
    @POST("briefing/generate")
    suspend fun generate(@Body body: GenerateBriefingBody): BriefingResponse

    /** Báo cáo mới nhất của kỳ; 404 BRIEFING_NOT_FOUND khi kỳ chưa có. */
    @GET("briefing/latest")
    suspend fun getLatest(@Query("period") period: String): BriefingResponse

    @GET("briefing/history")
    suspend fun getHistory(
        @Query("period") period: String?,
        @Query("limit") limit: Int,
    ): BriefingHistoryResponse
}
