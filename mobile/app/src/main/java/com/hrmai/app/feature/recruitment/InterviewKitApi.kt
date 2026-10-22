package com.hrmai.app.feature.recruitment

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

// ---------------------------------------------------------------------------
// DTO + Retrofit API cho Bộ câu hỏi phỏng vấn AI của một tin tuyển dụng.
// Nguồn sự thật: server/app/blueprints/recruitment/routes.py (khối
// interview-kit) + schemas.py (InterviewKitSchema) + kit_service.py:
// - GET  /jobs/{id}/interview-kit           — đọc bộ hiện tại; CHỈ admin/hr.
//   Chưa tạo -> 404; role khác -> 403.
// - POST /jobs/{id}/interview-kit/generate  — sinh/tái tạo bằng AI (hoặc
//   bản mẫu dự phòng khi AI không khả dụng); mỗi lần tái tạo version +1.
//   Có thể mất 10–30 giây khi AI chạy thật.
// - PUT  /jobs/{id}/interview-kit { questions: [...] } — HR sửa tay: server
//   validate đủ 3 vòng, mỗi câu có rubric + weight > 0, rồi CHUẨN HOÁ lại
//   tổng weight = 100 (tỉ trọng vòng 40/40/20); KHÔNG tăng version,
//   KHÔNG đổi nhãn nguồn.
// Cả 3 endpoint đều trả { data: kit } với kit =
// { id, job_posting_id, questions: [{ round, topic, question, rubric,
// weight }], generated_by: "ai" | "template", version, updated_by,
// created_at, updated_at }. round: 1 = kiến thức nền, 2 = tình huống &
// kỹ năng, 3 = văn hoá & động lực.
// ---------------------------------------------------------------------------

@JsonClass(generateAdapter = false)
data class InterviewQuestionDto(
    val round: Int? = null,
    val topic: String? = null,
    val question: String? = null,
    val rubric: String? = null,
    val weight: Double? = null,
)

@JsonClass(generateAdapter = false)
data class InterviewKitDto(
    val id: Int? = null,
    @Json(name = "job_posting_id") val jobPostingId: Int? = null,
    val questions: List<InterviewQuestionDto>? = null,
    @Json(name = "generated_by") val generatedBy: String? = null,
    val version: Int? = null,
    @Json(name = "updated_by") val updatedBy: Int? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class InterviewKitResponse(
    val data: InterviewKitDto? = null,
)

@JsonClass(generateAdapter = false)
data class InterviewKitUpdateBody(
    val questions: List<InterviewQuestionDto>,
)

interface InterviewKitApi {
    @GET("jobs/{id}/interview-kit")
    suspend fun getKit(@Path("id") jobId: Int): InterviewKitResponse

    @POST("jobs/{id}/interview-kit/generate")
    suspend fun generateKit(@Path("id") jobId: Int): InterviewKitResponse

    @PUT("jobs/{id}/interview-kit")
    suspend fun updateKit(
        @Path("id") jobId: Int,
        @Body body: InterviewKitUpdateBody,
    ): InterviewKitResponse
}

/** Nhãn tiếng Việt cho từng vòng phỏng vấn (khớp ROUND_LABELS phía server). */
fun interviewRoundLabel(round: Int?): String = when (round) {
    1 -> "Kiến thức nền"
    2 -> "Tình huống & kỹ năng"
    3 -> "Văn hoá & động lực"
    else -> "Vòng ${round ?: "—"}"
}

/** Nhãn nguồn của bộ câu hỏi: AI sinh thật hay bản mẫu dự phòng. */
fun interviewKitSourceLabel(generatedBy: String?): String = when (generatedBy) {
    "ai" -> "Do AI tạo"
    "template" -> "Bản mẫu tự động"
    null -> "—"
    else -> generatedBy
}
