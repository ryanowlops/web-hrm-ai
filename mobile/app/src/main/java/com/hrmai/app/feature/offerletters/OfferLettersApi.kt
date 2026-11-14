package com.hrmai.app.feature.offerletters

import com.hrmai.app.feature.recruitment.CandidatesResponse
import com.hrmai.app.feature.recruitment.JobsResponse
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

// ---------------------------------------------------------------------------
// DTO + Retrofit API cho module Thư mời nhận việc (Offer Letter).
// Nguồn sự thật: server/app/blueprints/offer_letters/{routes,schemas,services}.py
// + client/src/features/offer-letters/{services.js,pages/OfferLettersPage.jsx}:
// - GET /offer-letters?status=&candidate_id=&page=&limit=: { data, meta }.
//   Chỉ admin/hr (403 nếu khác). Lọc status: draft/sent/accepted/declined/
//   withdrawn/expired — 'expired' do backend tính lúc đọc (sent + quá hạn
//   trả lời), không lưu trong DB.
// - GET /offer-letters/{id}: { data }.
// - POST /offer-letters { candidate_id, job_id?, salary, start_date,
//   deadline? }: tạo thư ở trạng thái nháp, nội dung thư do backend sinh
//   từ mẫu tiếng Việt. salary: số nguyên VNĐ/tháng > 0; start_date không
//   được trong quá khứ; job_id null -> lấy vị trí ứng viên đã ứng tuyển.
// - POST /offer-letters/{id}/send: draft -> sent.
// - POST /offer-letters/{id}/respond { decision: accepted|declined }:
//   sent -> accepted | declined.
// - POST /offer-letters/{id}/withdraw: draft|sent -> withdrawn.
// - GET /candidates (job_id tuỳ chọn) + GET /jobs: ô chọn trong form tạo
//   thư mời (cùng endpoint web dùng: getCandidatesForSelect/getJobsForSelect).
// Serialize trả về đã là camelCase; chỉ body tạo/phản hồi mới cần snake_case.
// ---------------------------------------------------------------------------

@JsonClass(generateAdapter = false)
data class OfferLetterDto(
    val id: Int? = null,
    val candidateId: Int? = null,
    val candidateName: String? = null,
    val candidateEmail: String? = null,
    val jobId: Int? = null,
    val jobTitle: String? = null,
    /** Lương VNĐ/tháng (số nguyên, backend validate > 0). */
    val salary: Long? = null,
    /** Ngày bắt đầu làm việc, ISO "YYYY-MM-DD". */
    val startDate: String? = null,
    /** Hạn trả lời, ISO "YYYY-MM-DD", có thể null. */
    val deadline: String? = null,
    /** Trạng thái hiển thị: draft|sent|accepted|declined|withdrawn|expired. */
    val status: String? = null,
    /** Nội dung thư mời do backend sinh từ mẫu tiếng Việt. */
    val letterBody: String? = null,
    val createdBy: Int? = null,
    val createdByName: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class OfferLettersPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class OfferLettersResponse(
    val data: List<OfferLetterDto>? = null,
    val meta: OfferLettersPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class OfferLetterResponse(
    val data: OfferLetterDto? = null,
)

@JsonClass(generateAdapter = false)
data class CreateOfferBody(
    @Json(name = "candidate_id") val candidateId: Int,
    @Json(name = "job_id") val jobId: Int? = null,
    val salary: Long,
    @Json(name = "start_date") val startDate: String,
    val deadline: String? = null,
)

@JsonClass(generateAdapter = false)
data class RespondOfferBody(
    val decision: String,
)

interface OfferLettersApi {
    @GET("offer-letters")
    suspend fun listOffers(
        @Query("status") status: String? = null,
        @Query("candidate_id") candidateId: Int? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): OfferLettersResponse

    @GET("offer-letters/{id}")
    suspend fun getOffer(@Path("id") id: Int): OfferLetterResponse

    @POST("offer-letters")
    suspend fun createOffer(@Body body: CreateOfferBody): OfferLetterResponse

    @POST("offer-letters/{id}/send")
    suspend fun sendOffer(
        @Path("id") id: Int,
        @Body body: Map<String, String> = emptyMap(),
    ): OfferLetterResponse

    @POST("offer-letters/{id}/respond")
    suspend fun respondOffer(
        @Path("id") id: Int,
        @Body body: RespondOfferBody,
    ): OfferLetterResponse

    @POST("offer-letters/{id}/withdraw")
    suspend fun withdrawOffer(
        @Path("id") id: Int,
        @Body body: Map<String, String> = emptyMap(),
    ): OfferLetterResponse

    /** Ứng viên cho ô chọn trong form tạo thư (admin/hr, job_id tuỳ chọn). */
    @GET("candidates")
    suspend fun listCandidates(
        @Query("job_id") jobId: Int? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): CandidatesResponse

    /** Tin tuyển dụng cho ô chọn trong form tạo thư (admin/hr thấy tất cả). */
    @GET("jobs")
    suspend fun listJobs(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): JobsResponse
}

/** Nhãn tiếng Việt cho trạng thái thư mời (khớp STATUS_META bên web). */
fun offerStatusLabel(status: String?): String = when (status) {
    "draft" -> "Nháp"
    "sent" -> "Đã gửi"
    "accepted" -> "Đã chấp nhận"
    "declined" -> "Từ chối"
    "withdrawn" -> "Thu hồi"
    "expired" -> "Hết hạn"
    null -> "—"
    else -> status
}

/** Toàn bộ trạng thái thư mời server chấp nhận lọc, theo thứ tự vòng đời. */
val OFFER_STATUSES: List<String> =
    listOf("draft", "sent", "accepted", "declined", "withdrawn", "expired")
