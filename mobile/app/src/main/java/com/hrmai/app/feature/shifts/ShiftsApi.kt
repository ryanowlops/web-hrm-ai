package com.hrmai.app.feature.shifts

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Ca làm việc (prefix /api/v1/shifts).
 * Nguồn sự thật: server/app/blueprints/shifts/routes.py + schemas.py.
 * Mọi response đều bọc { data, meta? } (khác leave: POST cũng bọc data).
 * - Tăng ca: POST body { work_date, hours (0,16], reason? }.
 * - Chỉnh công (corrections): body { work_date, requested_check_in?,
 *   requested_check_out? (ISO datetime), reason (bắt buộc) }; phải có ít
 *   nhất 1 giờ đề xuất và giờ ra sau giờ vào.
 * - Duyệt 2 cấp giống leave: manager-decision (manager) rồi hr-decision
 *   (hr/admin); decision chấp nhận "approved"/"rejected", từ chối bắt
 *   buộc có note (server validate).
 */

@JsonClass(generateAdapter = false)
data class ShiftDefinitionDto(
    val id: Int? = null,
    val name: String? = null,
    @Json(name = "start_time") val startTime: String? = null,
    @Json(name = "end_time") val endTime: String? = null,
    @Json(name = "break_minutes") val breakMinutes: Int? = null,
    @Json(name = "is_overnight") val isOvernight: Boolean? = null,
    @Json(name = "is_active") val isActive: Boolean? = null,
)

@JsonClass(generateAdapter = false)
data class ShiftDefinitionsResponse(
    val data: List<ShiftDefinitionDto>? = null,
)

@JsonClass(generateAdapter = false)
data class ShiftAssignmentDto(
    val id: Int? = null,
    @Json(name = "shift_id") val shiftId: Int? = null,
    @Json(name = "shift_name") val shiftName: String? = null,
    @Json(name = "work_date") val workDate: String? = null,
    val note: String? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
)

@JsonClass(generateAdapter = false)
data class ShiftScheduleResponse(
    val data: List<ShiftAssignmentDto>? = null,
)

/** Các trường duyệt dùng chung cho tăng ca và chỉnh công. */
interface ApprovalFields {
    val status: String?
    val managerDecision: String?
    val managerDecidedByName: String?
    val managerNote: String?
    val hrDecision: String?
    val hrDecidedByName: String?
    val hrNote: String?
    val createdAt: String?
}

@JsonClass(generateAdapter = false)
data class OvertimeDto(
    val id: Int? = null,
    @Json(name = "work_date") val workDate: String? = null,
    val hours: Double? = null,
    val reason: String? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    override val status: String? = null,
    @Json(name = "manager_decision") override val managerDecision: String? = null,
    @Json(name = "manager_decided_by_name") override val managerDecidedByName: String? = null,
    @Json(name = "manager_note") override val managerNote: String? = null,
    @Json(name = "hr_decision") override val hrDecision: String? = null,
    @Json(name = "hr_decided_by_name") override val hrDecidedByName: String? = null,
    @Json(name = "hr_note") override val hrNote: String? = null,
    @Json(name = "created_at") override val createdAt: String? = null,
) : ApprovalFields

@JsonClass(generateAdapter = false)
data class CorrectionDto(
    val id: Int? = null,
    @Json(name = "attendance_id") val attendanceId: Int? = null,
    @Json(name = "work_date") val workDate: String? = null,
    @Json(name = "requested_check_in") val requestedCheckIn: String? = null,
    @Json(name = "requested_check_out") val requestedCheckOut: String? = null,
    val reason: String? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    override val status: String? = null,
    @Json(name = "manager_decision") override val managerDecision: String? = null,
    @Json(name = "manager_decided_by_name") override val managerDecidedByName: String? = null,
    @Json(name = "manager_note") override val managerNote: String? = null,
    @Json(name = "hr_decision") override val hrDecision: String? = null,
    @Json(name = "hr_decided_by_name") override val hrDecidedByName: String? = null,
    @Json(name = "hr_note") override val hrNote: String? = null,
    @Json(name = "created_at") override val createdAt: String? = null,
) : ApprovalFields

@JsonClass(generateAdapter = false)
data class ShiftsPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class OvertimeResponse(
    val data: List<OvertimeDto>? = null,
    val meta: ShiftsPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class OvertimeSingleResponse(
    val data: OvertimeDto? = null,
)

@JsonClass(generateAdapter = false)
data class CorrectionsResponse(
    val data: List<CorrectionDto>? = null,
    val meta: ShiftsPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class CorrectionSingleResponse(
    val data: CorrectionDto? = null,
)

@JsonClass(generateAdapter = false)
data class CreateOvertimeBody(
    @Json(name = "work_date") val workDate: String,
    val hours: Double,
    val reason: String? = null,
)

@JsonClass(generateAdapter = false)
data class CreateCorrectionBody(
    @Json(name = "work_date") val workDate: String,
    @Json(name = "requested_check_in") val requestedCheckIn: String? = null,
    @Json(name = "requested_check_out") val requestedCheckOut: String? = null,
    val reason: String,
)

@JsonClass(generateAdapter = false)
data class ShiftDecisionBody(
    val decision: String,
    val note: String? = null,
)

interface ShiftsApi {
    @GET("shifts/definitions")
    suspend fun getDefinitions(): ShiftDefinitionsResponse

    @GET("shifts/my-schedule")
    suspend fun getMySchedule(@Query("month") month: String): ShiftScheduleResponse

    @GET("shifts/overtime")
    suspend fun getOvertime(
        @Query("scope") scope: String?,
        @Query("status") status: String?,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): OvertimeResponse

    @POST("shifts/overtime")
    suspend fun createOvertime(@Body body: CreateOvertimeBody): OvertimeSingleResponse

    @POST("shifts/overtime/{id}/manager-decision")
    suspend fun overtimeManagerDecision(
        @Path("id") id: Int,
        @Body body: ShiftDecisionBody,
    ): OvertimeSingleResponse

    @POST("shifts/overtime/{id}/hr-decision")
    suspend fun overtimeHrDecision(
        @Path("id") id: Int,
        @Body body: ShiftDecisionBody,
    ): OvertimeSingleResponse

    @GET("shifts/corrections")
    suspend fun getCorrections(
        @Query("scope") scope: String?,
        @Query("status") status: String?,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): CorrectionsResponse

    @POST("shifts/corrections")
    suspend fun createCorrection(@Body body: CreateCorrectionBody): CorrectionSingleResponse

    @POST("shifts/corrections/{id}/manager-decision")
    suspend fun correctionManagerDecision(
        @Path("id") id: Int,
        @Body body: ShiftDecisionBody,
    ): CorrectionSingleResponse

    @POST("shifts/corrections/{id}/hr-decision")
    suspend fun correctionHrDecision(
        @Path("id") id: Int,
        @Body body: ShiftDecisionBody,
    ): CorrectionSingleResponse
}
