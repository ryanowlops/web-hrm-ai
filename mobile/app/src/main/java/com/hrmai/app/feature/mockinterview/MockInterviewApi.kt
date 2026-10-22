package com.hrmai.app.feature.mockinterview

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Phỏng vấn thử AI — prefix /interviews (blueprint interviews, v5 mục B).
 *
 * Xác thực 2 dạng:
 * - User đã đăng nhập: interceptor tự gắn JWT, KHÔNG cần token phiên.
 * - Khách: POST /start kèm guest_name + guest_email, server trả
 *   ``access_token`` đúng MỘT lần; các lần gọi sau gửi header
 *   ``X-Session-Token: <access_token>`` (tham số header null = Retrofit
 *   tự bỏ qua, nên user đăng nhập cứ truyền null).
 * - POST /finish idempotent: gọi lại khi đã kết thúc vẫn trả báo cáo cũ.
 */
interface MockInterviewApi {
    @POST("interviews/start")
    suspend fun start(@Body body: StartInterviewRequest): StartInterviewResponse

    @POST("interviews/{id}/answer")
    suspend fun answer(
        @Path("id") sessionId: Int,
        @Header("X-Session-Token") sessionToken: String?,
        @Body body: AnswerRequest,
    ): AnswerResponse

    @POST("interviews/{id}/finish")
    suspend fun finish(
        @Path("id") sessionId: Int,
        @Header("X-Session-Token") sessionToken: String?,
    ): InterviewReportResponse
}

@JsonClass(generateAdapter = false)
data class StartInterviewRequest(
    @Json(name = "job_id") val jobId: Int,
    @Json(name = "guest_name") val guestName: String? = null,
    @Json(name = "guest_email") val guestEmail: String? = null,
)

@JsonClass(generateAdapter = false)
data class InterviewJobDto(
    val id: Int,
    val title: String,
    val department: InterviewDepartmentDto? = null,
)

@JsonClass(generateAdapter = false)
data class InterviewDepartmentDto(
    val id: Int,
    val name: String,
)

@JsonClass(generateAdapter = false)
data class InterviewQuestionDto(
    @Json(name = "order_no") val orderNo: Int,
    val question: String,
)

@JsonClass(generateAdapter = false)
data class StartInterviewDto(
    @Json(name = "session_id") val sessionId: Int,
    val job: InterviewJobDto? = null,
    @Json(name = "total_questions") val totalQuestions: Int = 0,
    @Json(name = "first_question") val firstQuestion: InterviewQuestionDto? = null,
    /** Chỉ có với khách (user_id = null); user đăng nhập thì vắng mặt. */
    @Json(name = "access_token") val accessToken: String? = null,
)

@JsonClass(generateAdapter = false)
data class StartInterviewResponse(val data: StartInterviewDto)

@JsonClass(generateAdapter = false)
data class AnswerRequest(val answer: String)

@JsonClass(generateAdapter = false)
data class AnswerResultDto(
    val done: Boolean = false,
    @Json(name = "answered_count") val answeredCount: Int = 0,
    @Json(name = "total_questions") val totalQuestions: Int = 0,
    @Json(name = "next_question") val nextQuestion: InterviewQuestionDto? = null,
)

@JsonClass(generateAdapter = false)
data class AnswerResponse(val data: AnswerResultDto)

@JsonClass(generateAdapter = false)
data class InterviewSummaryDto(
    /** Nguồn chấm điểm trung thực: "ai" | "heuristic". */
    val source: String? = null,
    val strengths: List<String> = emptyList(),
    val improvements: List<String> = emptyList(),
    val verdict: String? = null,
)

@JsonClass(generateAdapter = false)
data class InterviewQaReportDto(
    @Json(name = "order_no") val orderNo: Int,
    val question: String,
    val answer: String? = null,
    /** Điểm từng câu theo thang 0–10 (null nếu chưa chấm). */
    val score: Double? = null,
    val comment: String? = null,
)

@JsonClass(generateAdapter = false)
data class InterviewSessionDto(
    val id: Int,
    val job: InterviewJobDto? = null,
    @Json(name = "is_guest") val isGuest: Boolean = false,
    @Json(name = "guest_name") val guestName: String? = null,
    val status: String? = null,
    @Json(name = "current_index") val currentIndex: Int = 0,
    @Json(name = "total_questions") val totalQuestions: Int = 0,
    @Json(name = "answered_count") val answeredCount: Int = 0,
    /** Điểm tổng theo thang 0–100, chỉ có khi đã kết thúc. */
    @Json(name = "overall_score") val overallScore: Double? = null,
    val summary: InterviewSummaryDto? = null,
    val questions: List<InterviewQaReportDto> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class InterviewReportResponse(val data: InterviewSessionDto)
