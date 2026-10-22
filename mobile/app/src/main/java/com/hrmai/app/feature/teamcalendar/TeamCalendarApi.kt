package com.hrmai.app.feature.teamcalendar

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho Lịch nhóm (ai đang nghỉ phép theo ngày/tuần).
 * Nguồn: GET leave/calendar?month=YYYY-MM (server/app/blueprints/leave):
 * - Chỉ gồm đơn ĐÃ DUYỆT (status = approved) giao với tháng được hỏi.
 * - Phạm vi ở server: hr/admin = toàn công ty; manager = team của mình;
 *   employee = phòng ban của mình.
 * - Mỗi entry là leave_request_to_dict + department_id của người nghỉ
 *   (xem leave/schemas.py calendar_entry_to_dict).
 */

@JsonClass(generateAdapter = false)
data class TeamLeaveEntryDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "leave_type_name") val leaveTypeName: String? = null,
    @Json(name = "from_date") val fromDate: String? = null,
    @Json(name = "to_date") val toDate: String? = null,
    @Json(name = "days_count") val daysCount: Double? = null,
    val reason: String? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = false)
data class TeamCalendarResponse(
    val data: List<TeamLeaveEntryDto>? = null,
)

interface TeamCalendarApi {
    @GET("leave/calendar")
    suspend fun getCalendar(@Query("month") month: String): TeamCalendarResponse
}
