package com.hrmai.app.feature.recruitment

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

// ---------------------------------------------------------------------------
// DTO + Retrofit API cho module Tuyển dụng (phía HR).
// Nguồn sự thật: server/app/blueprints/recruitment/routes.py + schemas.py:
// - GET /jobs, GET /jobs/{id}: { data, meta? }. Tin: { id, title,
//   department_id, department_name, description, requirements, quantity,
//   deadline (YYYY-MM-DD), status: open|closed, candidates_count (chỉ có
//   khi service gắn — thường ở danh sách), created_at, updated_at }.
//   Người thường chỉ thấy tin open; Admin/HR thấy tất cả.
// - GET /candidates?job_id=&status=&search=: CHỈ admin/hr (403 nếu khác).
//   Payload ứng viên = CandidateSchema + match_score + latest_analysis
//   (điểm chấm CV bằng AI nằm NGAY trong object ứng viên, không cần gọi
//   thêm endpoint phân tích). latest_analysis có thể null nếu chưa chấm.
// - PATCH /candidates/{id}/status { status?, hr_note? }: đổi trạng thái
//   ứng viên (new|reviewing|interview|passed|rejected) — admin/hr.
// Trường Raw phía server (matched_skills, strengths...) khai Any? để chịu
// được cả dạng list lẫn chuỗi JSON.
// ---------------------------------------------------------------------------

@JsonClass(generateAdapter = false)
data class JobPostingDto(
    val id: Int? = null,
    val title: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    val description: String? = null,
    val requirements: String? = null,
    val quantity: Int? = null,
    val deadline: String? = null,
    val status: String? = null,
    @Json(name = "candidates_count") val candidatesCount: Int? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class RecruitmentPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class JobsResponse(
    val data: List<JobPostingDto>? = null,
    val meta: RecruitmentPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class JobResponse(
    val data: JobPostingDto? = null,
)

@JsonClass(generateAdapter = false)
data class CvAnalysisDto(
    val id: Int? = null,
    @Json(name = "candidate_id") val candidateId: Int? = null,
    @Json(name = "match_score") val matchScore: Int? = null,
    @Json(name = "matched_skills") val matchedSkills: Any? = null,
    @Json(name = "missing_skills") val missingSkills: Any? = null,
    @Json(name = "experience_years_estimate") val experienceYearsEstimate: Double? = null,
    @Json(name = "education_summary") val educationSummary: String? = null,
    val summary: String? = null,
    val strengths: Any? = null,
    val concerns: Any? = null,
    @Json(name = "model_name") val modelName: String? = null,
    val status: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class CandidateJobRefDto(
    val id: Int? = null,
    val title: String? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = false)
data class CandidateDto(
    val id: Int? = null,
    @Json(name = "job_id") val jobId: Int? = null,
    @Json(name = "full_name") val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    @Json(name = "cv_file_url") val cvFileUrl: String? = null,
    val status: String? = null,
    @Json(name = "hr_note") val hrNote: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
    /** Điểm chấm CV bằng AI (0–100), server gắn từ bản phân tích mới nhất. */
    @Json(name = "match_score") val matchScore: Int? = null,
    @Json(name = "latest_analysis") val latestAnalysis: CvAnalysisDto? = null,
    val job: CandidateJobRefDto? = null,
)

@JsonClass(generateAdapter = false)
data class CandidatesResponse(
    val data: List<CandidateDto>? = null,
    val meta: RecruitmentPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class CandidateResponse(
    val data: CandidateDto? = null,
)

@JsonClass(generateAdapter = false)
data class CandidateStatusBody(
    val status: String,
    @Json(name = "hr_note") val hrNote: String? = null,
)

interface RecruitmentApi {
    @GET("jobs")
    suspend fun listJobs(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): JobsResponse

    @GET("jobs/{id}")
    suspend fun getJob(@Path("id") id: Int): JobResponse

    @GET("candidates")
    suspend fun listCandidates(
        @Query("job_id") jobId: Int,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): CandidatesResponse

    @PATCH("candidates/{id}/status")
    suspend fun updateCandidateStatus(
        @Path("id") id: Int,
        @Body body: CandidateStatusBody,
    ): CandidateResponse
}

/** Nhãn tiếng Việt cho trạng thái ứng viên (khớp CANDIDATE_STATUSES server). */
fun candidateStatusLabel(status: String?): String = when (status) {
    "new" -> "Mới nộp"
    "reviewing" -> "Đang xem xét"
    "interview" -> "Phỏng vấn"
    "passed" -> "Đạt"
    "rejected" -> "Đã loại"
    null -> "—"
    else -> status
}

/** Toàn bộ trạng thái ứng viên server chấp nhận, theo thứ tự vòng đời. */
val CANDIDATE_STATUSES: List<String> =
    listOf("new", "reviewing", "interview", "passed", "rejected")
