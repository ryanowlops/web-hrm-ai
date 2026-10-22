package com.hrmai.app.feature.training

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Đào tạo.
 * Field khớp server/app/blueprints/training/schemas.py:
 * - GET courses / my đều bọc trong { data, meta }.
 * - Khoá học kèm enrollment_total / enrollment_completed (routes._course_dict).
 * - Enrollment lồng "course" (course_to_dict) + "course_title" khi include_course.
 * - PATCH enrollments: body { progress?: int 0..100, status?:
 *   assigned|in_progress|completed }; progress >= 100 tự chuyển completed,
 *   status=completed tự đặt progress=100 (services.update_enrollment).
 * - POST courses/{id}/enroll chỉ dành cho admin/hr (routes WRITE_ROLES) —
 *   nhân viên thường KHÔNG tự ghi danh được qua API.
 */

@JsonClass(generateAdapter = false)
data class CourseDto(
    val id: Int? = null,
    val title: String? = null,
    val description: String? = null,
    val category: String? = null,
    @Json(name = "duration_hours") val durationHours: Double? = null,
    @Json(name = "is_mandatory") val isMandatory: Boolean? = null,
    @Json(name = "is_active") val isActive: Boolean? = null,
    @Json(name = "enrollment_total") val enrollmentTotal: Int? = null,
    @Json(name = "enrollment_completed") val enrollmentCompleted: Int? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class TrainingPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class CoursesResponse(
    val data: List<CourseDto>? = null,
    val meta: TrainingPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class EnrollmentDto(
    val id: Int? = null,
    @Json(name = "course_id") val courseId: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "employee_code") val employeeCode: String? = null,
    val status: String? = null,
    val progress: Int? = null,
    @Json(name = "enrolled_by") val enrolledBy: Int? = null,
    @Json(name = "enrolled_by_name") val enrolledByName: String? = null,
    @Json(name = "completed_at") val completedAt: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
    val course: CourseDto? = null,
    @Json(name = "course_title") val courseTitle: String? = null,
)

@JsonClass(generateAdapter = false)
data class MyCoursesResponse(
    val data: List<EnrollmentDto>? = null,
    val meta: TrainingPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class EnrollmentResponse(
    val data: EnrollmentDto? = null,
)

/** Moshi bỏ qua field null khi serialize mặc định? Không — field null vẫn
 *  được gửi dạng JSON null; server validate bỏ qua giá trị null nên an toàn. */
@JsonClass(generateAdapter = false)
data class UpdateEnrollmentBody(
    val progress: Int? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = false)
data class EnrollBody(
    @Json(name = "employee_ids") val employeeIds: List<Int>,
)

@JsonClass(generateAdapter = false)
data class EnrollMeta(
    val created: Int? = null,
    @Json(name = "skipped_employee_ids") val skippedEmployeeIds: List<Int>? = null,
)

@JsonClass(generateAdapter = false)
data class EnrollResponse(
    val data: List<EnrollmentDto>? = null,
    val meta: EnrollMeta? = null,
)

interface TrainingApi {
    @GET("training/courses")
    suspend fun getCourses(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): CoursesResponse

    @GET("training/my")
    suspend fun getMyCourses(): MyCoursesResponse

    @PATCH("training/enrollments/{id}")
    suspend fun updateEnrollment(
        @Path("id") id: Int,
        @Body body: UpdateEnrollmentBody,
    ): EnrollmentResponse

    @POST("training/courses/{id}/enroll")
    suspend fun enroll(
        @Path("id") courseId: Int,
        @Body body: EnrollBody,
    ): EnrollResponse
}
