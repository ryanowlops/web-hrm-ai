package com.hrmai.app.feature.surveys

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * DTO + Retrofit API cho Khảo sát gắn kết (blueprint engagement, mục surveys).
 * Field khớp server/app/blueprints/engagement/schemas.py + services.py:
 * - GET engagement/surveys trả { data: [...] } KHÔNG có meta; HR/Admin thấy
 *   mọi trạng thái + response_count, vai trò khác chỉ thấy khảo sát active.
 * - Câu hỏi: { id, type: enps|scale|single|text, text, options? (chỉ single) }.
 * - POST responses body { answers: { <qid>: int|string } }; đáp án ẩn danh,
 *   mỗi user 1 lần (lần 2 -> 409 ALREADY_RESPONDED).
 * - GET results chỉ admin/hr: { survey, total_responses, questions[] } với
 *   tổng hợp riêng theo từng loại câu hỏi (xem QuestionResultDto).
 */

@JsonClass(generateAdapter = false)
data class SurveyQuestionDto(
    val id: String? = null,
    val type: String? = null,
    val text: String? = null,
    val options: List<String>? = null,
)

@JsonClass(generateAdapter = false)
data class SurveyDto(
    val id: Int? = null,
    val title: String? = null,
    val description: String? = null,
    val questions: List<SurveyQuestionDto>? = null,
    val status: String? = null,
    @Json(name = "created_by") val createdBy: Int? = null,
    @Json(name = "created_by_name") val createdByName: String? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    val responded: Boolean? = null,
    @Json(name = "response_count") val responseCount: Int? = null,
)

@JsonClass(generateAdapter = false)
data class SurveysResponse(
    val data: List<SurveyDto>? = null,
)

@JsonClass(generateAdapter = false)
data class RespondResultDto(
    val id: Int? = null,
    val responded: Boolean? = null,
)

@JsonClass(generateAdapter = false)
data class RespondResponse(
    val data: RespondResultDto? = null,
)

/** Kết quả tổng hợp 1 câu hỏi — field thay đổi theo type (services.survey_results). */
@JsonClass(generateAdapter = false)
data class QuestionResultDto(
    val id: String? = null,
    val type: String? = null,
    val text: String? = null,
    val answered: Int? = null,
    // enps + scale
    val average: Double? = null,
    // enps
    @Json(name = "enps_score") val enpsScore: Int? = null,
    val promoters: Int? = null,
    val passives: Int? = null,
    val detractors: Int? = null,
    @Json(name = "promoter_pct") val promoterPct: Double? = null,
    @Json(name = "passive_pct") val passivePct: Double? = null,
    @Json(name = "detractor_pct") val detractorPct: Double? = null,
    // scale: { "1".."5": số lượng }
    val distribution: Map<String, Int>? = null,
    // single
    val options: List<String>? = null,
    val counts: Map<String, Int>? = null,
    // text: danh sách câu trả lời tự do (không định danh)
    val answers: List<String>? = null,
)

@JsonClass(generateAdapter = false)
data class SurveyResultsDto(
    val survey: SurveyDto? = null,
    @Json(name = "total_responses") val totalResponses: Int? = null,
    val questions: List<QuestionResultDto>? = null,
)

@JsonClass(generateAdapter = false)
data class SurveyResultsResponse(
    val data: SurveyResultsDto? = null,
)

interface SurveysApi {
    @GET("engagement/surveys")
    suspend fun listSurveys(): SurveysResponse

    /** Body JSON động { answers: {...} } — ViewModel tự dựng bằng JSONObject
     *  (giống cách chatbot gửi payload hành động). */
    @POST("engagement/surveys/{id}/responses")
    suspend fun respond(
        @Path("id") surveyId: Int,
        @Body body: RequestBody,
    ): ResponseBody

    @GET("engagement/surveys/{id}/results")
    suspend fun results(@Path("id") surveyId: Int): SurveyResultsResponse
}
