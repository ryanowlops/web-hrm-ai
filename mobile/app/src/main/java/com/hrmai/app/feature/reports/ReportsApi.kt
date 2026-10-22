package com.hrmai.app.feature.reports

import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho Báo cáo tổng quan (blueprint stats).
 * GET stats/reports/summary?month=&year= trả object Ở TẦNG CAO NHẤT —
 * KHÔNG bọc trong { data } như các module khác, và toàn bộ key là
 * camelCase (xem server/app/blueprints/stats/routes.py, reports_summary).
 * Phân quyền: admin/hr xem toàn công ty, manager chỉ phòng ban của mình,
 * employee bị 403.
 */

@JsonClass(generateAdapter = false)
data class ReportsSummaryDto(
    val scope: String? = null,
    val month: Int? = null,
    val year: Int? = null,
    val headcount: HeadcountDto? = null,
    val attendance: AttendanceSummaryDto? = null,
    val leave: LeaveSummaryDto? = null,
    val payroll: PayrollSummaryDto? = null,
)

@JsonClass(generateAdapter = false)
data class DepartmentCountDto(
    val departmentId: Int? = null,
    val departmentName: String? = null,
    val employeeCount: Int? = null,
)

@JsonClass(generateAdapter = false)
data class HeadcountDto(
    val total: Int? = null,
    val byDepartment: List<DepartmentCountDto>? = null,
)

@JsonClass(generateAdapter = false)
data class AttendanceSummaryDto(
    val present: Int? = null,
    val late: Int? = null,
    val absent: Int? = null,
    val onLeave: Int? = null,
    val totalRecords: Int? = null,
    val attendanceRate: Double? = null,
)

@JsonClass(generateAdapter = false)
data class LeaveTypeSummaryDto(
    val leaveType: String? = null,
    val requests: Int? = null,
    val days: Double? = null,
)

@JsonClass(generateAdapter = false)
data class LeaveSummaryDto(
    val totalRequests: Int? = null,
    val totalDays: Double? = null,
    val byType: List<LeaveTypeSummaryDto>? = null,
)

@JsonClass(generateAdapter = false)
data class PayrollPeriodDto(
    val month: Int? = null,
    val year: Int? = null,
    /** draft | calculated | locked */
    val status: String? = null,
)

@JsonClass(generateAdapter = false)
data class DepartmentPayrollDto(
    val departmentId: Int? = null,
    val departmentName: String? = null,
    val employeeCount: Int? = null,
    val totalCost: Long? = null,
)

@JsonClass(generateAdapter = false)
data class PayrollSummaryDto(
    val period: PayrollPeriodDto? = null,
    val totalCost: Long? = null,
    val employeeCount: Int? = null,
    val byDepartment: List<DepartmentPayrollDto>? = null,
)

/** Nhãn trạng thái kỳ lương. */
object PayrollPeriodStatus {
    fun labelOf(status: String?): String = when (status) {
        "locked" -> "Đã khoá"
        "calculated" -> "Đã tính"
        "draft" -> "Bản nháp"
        else -> status ?: "—"
    }
}

interface ReportsApi {
    @GET("stats/reports/summary")
    suspend fun getSummary(
        @Query("month") month: Int,
        @Query("year") year: Int,
    ): ReportsSummaryDto
}
