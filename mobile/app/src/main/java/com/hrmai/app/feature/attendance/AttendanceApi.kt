package com.hrmai.app.feature.attendance

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Chấm công.
 * Field khớp server/app/blueprints/attendance/schemas.py (AttendanceSchema)
 * và routes.py: today trả { data, has_checked_in, has_checked_out,
 * work_start_time }; monthly (mine=1) trả { data, summary, meta, month }.
 */

@JsonClass(generateAdapter = false)
data class AttendanceRecordDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_code") val employeeCode: String? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "work_date") val workDate: String? = null,
    @Json(name = "check_in_at") val checkInAt: String? = null,
    @Json(name = "check_out_at") val checkOutAt: String? = null,
    val status: String? = null,
    val note: String? = null,
)

@JsonClass(generateAdapter = false)
data class AttendanceTodayDto(
    val data: AttendanceRecordDto? = null,
    @Json(name = "has_checked_in") val hasCheckedIn: Boolean? = null,
    @Json(name = "has_checked_out") val hasCheckedOut: Boolean? = null,
    @Json(name = "work_start_time") val workStartTime: String? = null,
)

@JsonClass(generateAdapter = false)
data class AttendanceRecordResponse(
    val data: AttendanceRecordDto? = null,
)

@JsonClass(generateAdapter = false)
data class AttendanceSummaryDto(
    @Json(name = "total_records") val totalRecords: Int? = null,
    val present: Int? = null,
    val late: Int? = null,
    val absent: Int? = null,
    @Json(name = "on_leave") val onLeave: Int? = null,
    @Json(name = "late_count") val lateCount: Int? = null,
    @Json(name = "days_worked") val daysWorked: Int? = null,
    val workdays: Int? = null,
    @Json(name = "missing_checkout") val missingCheckout: Int? = null,
)

@JsonClass(generateAdapter = false)
data class AttendanceMonthlyDto(
    val data: List<AttendanceRecordDto>? = null,
    val summary: AttendanceSummaryDto? = null,
    val month: String? = null,
)

interface AttendanceApi {
    @GET("attendance/today")
    suspend fun getToday(): AttendanceTodayDto

    @POST("attendance/check-in")
    suspend fun checkIn(): AttendanceRecordResponse

    @POST("attendance/check-out")
    suspend fun checkOut(): AttendanceRecordResponse

    /** mine=1 để server trả danh sách phẳng của chính mình kèm summary
     *  (đúng cách bản web gọi trong getMyMonthly). */
    @GET("attendance/monthly")
    suspend fun getMonthly(
        @Query("month") month: String,
        @Query("mine") mine: Int = 1,
    ): AttendanceMonthlyDto
}
