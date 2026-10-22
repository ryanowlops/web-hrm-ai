package com.hrmai.app.feature.cvcheck

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Kiểm tra CV công khai: POST /public/cv-check.
 *
 * Server nhận CẢ HAI dạng (routes.py): multipart file PDF/TXT hoặc JSON
 * ``{job_id, cv_text}``. App dùng dạng JSON với CV dán dạng text.
 * Kết quả phân tích tức thời, server KHÔNG lưu vào DB.
 * Rate limit riêng: 10 lần/phút, 30 lần/giờ mỗi IP (429 khi vượt).
 */
interface CvCheckApi {
    @POST("public/cv-check")
    suspend fun checkCv(@Body body: CvCheckRequest): CvCheckResponse
}

@JsonClass(generateAdapter = false)
data class CvCheckRequest(
    @Json(name = "job_id") val jobId: Int,
    @Json(name = "cv_text") val cvText: String,
)

@JsonClass(generateAdapter = false)
data class CvCheckResultDto(
    val score: Int = 0,
    val verdict: String? = null,
    val strengths: List<String> = emptyList(),
    val improvements: List<String> = emptyList(),
    @Json(name = "matched_keywords") val matchedKeywords: List<String> = emptyList(),
    @Json(name = "missing_keywords") val missingKeywords: List<String> = emptyList(),
    /** Nguồn phân tích trung thực từ server: "ai" | "heuristic". */
    val source: String? = null,
    @Json(name = "job_id") val jobId: Int? = null,
    @Json(name = "job_title") val jobTitle: String? = null,
)

@JsonClass(generateAdapter = false)
data class CvCheckResponse(
    val data: CvCheckResultDto,
)
