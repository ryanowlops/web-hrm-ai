package com.hrmai.app.feature.payroll

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Query

// ---------------------------------------------------------------------------
// DTO — khớp server/app/blueprints/payroll/schemas.py:
// - period_to_dict: { id, month, year, standard_workdays, status, locked_at }.
// - item_to_dict (phiếu lương): { id, period_id, period: { month, year,
//   status }, employee_id, employee_code, employee_name, department_name,
//   workdays_paid, base_salary, allowance, insurance_deduction,
//   other_deduction, total_salary, breakdown, currency } (tiền = VND nguyên).
// - breakdown (calculator.py): { base_salary, allowance, standard_workdays,
//   paid_workdays, unpaid_days, workday_salary, insurance_rate,
//   insurance_deduction, other_deduction, total_salary, currency }.
// Envelope: { data: ... } / { data: [...], meta }.
// Lưu ý quyền: GET /payroll/periods chỉ admin/hr (routes.py WRITE_ROLES) —
// nhân viên thường nhận 403, khi đó bỏ qua danh sách kỳ và dùng phiếu của
// kỳ đã chốt mới nhất qua my-payslip không truyền period_id (giống web).
// ---------------------------------------------------------------------------

@JsonClass(generateAdapter = false)
data class PayrollPeriodDto(
    val id: Int? = null,
    val month: Int? = null,
    val year: Int? = null,
    @Json(name = "standard_workdays") val standardWorkdays: Double? = null,
    val status: String? = null,
    @Json(name = "locked_at") val lockedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class PayrollPeriodsResponse(
    val data: List<PayrollPeriodDto>? = null,
)

@JsonClass(generateAdapter = false)
data class PayslipPeriodDto(
    val month: Int? = null,
    val year: Int? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = false)
data class PayslipBreakdownDto(
    @Json(name = "base_salary") val baseSalary: Long? = null,
    val allowance: Long? = null,
    @Json(name = "standard_workdays") val standardWorkdays: Double? = null,
    @Json(name = "paid_workdays") val paidWorkdays: Double? = null,
    @Json(name = "unpaid_days") val unpaidDays: Double? = null,
    @Json(name = "workday_salary") val workdaySalary: Long? = null,
    @Json(name = "insurance_rate") val insuranceRate: Double? = null,
    @Json(name = "insurance_deduction") val insuranceDeduction: Long? = null,
    @Json(name = "other_deduction") val otherDeduction: Long? = null,
    @Json(name = "total_salary") val totalSalary: Long? = null,
)

@JsonClass(generateAdapter = false)
data class PayslipDto(
    val id: Int? = null,
    @Json(name = "period_id") val periodId: Int? = null,
    val period: PayslipPeriodDto? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_code") val employeeCode: String? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    @Json(name = "workdays_paid") val workdaysPaid: Double? = null,
    @Json(name = "base_salary") val baseSalary: Long? = null,
    val allowance: Long? = null,
    @Json(name = "insurance_deduction") val insuranceDeduction: Long? = null,
    @Json(name = "other_deduction") val otherDeduction: Long? = null,
    @Json(name = "total_salary") val totalSalary: Long? = null,
    val breakdown: PayslipBreakdownDto? = null,
    val currency: String? = null,
)

@JsonClass(generateAdapter = false)
data class PayslipResponse(
    val data: PayslipDto? = null,
)

interface PayrollApi {
    @GET("payroll/periods")
    suspend fun periods(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): PayrollPeriodsResponse

    @GET("payroll/my-payslip")
    suspend fun myPayslip(@Query("period_id") periodId: Int? = null): PayslipResponse
}
