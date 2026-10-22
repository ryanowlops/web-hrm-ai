package com.hrmai.app.feature.jobs

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Việc làm đang mở (công khai, không cần JWT):
 * - GET /jobs?status=open -> danh sách (server tự ép chỉ tin "open" với khách).
 * - GET /jobs/{id}        -> chi tiết (tin đã đóng trả 404 với khách).
 *
 * Shape bám JobPostingSchema phía server (snake_case).
 */
interface JobsApi {
    @GET("jobs")
    suspend fun listOpenJobs(@Query("status") status: String = "open"): JobsListResponse

    @GET("jobs/{id}")
    suspend fun getJob(@Path("id") jobId: Int): JobDetailResponse
}

@JsonClass(generateAdapter = false)
data class JobPostingDto(
    val id: Int,
    val title: String,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    val description: String? = null,
    val requirements: String? = null,
    val quantity: Int? = null,
    /** Hạn nộp hồ sơ dạng "yyyy-MM-dd". */
    val deadline: String? = null,
    val status: String? = null,
    @Json(name = "candidates_count") val candidatesCount: Int? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class JobsListResponse(
    val data: List<JobPostingDto> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class JobDetailResponse(
    val data: JobPostingDto,
)
