package com.hrmai.app.feature.payrolladmin

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

// ---------------------------------------------------------------------------
// DTO + Retrofit API cho Quản lý lương phía HR (khác feature/payroll là
// phiếu lương cá nhân của nhân viên).
// Nguồn sự thật: server/app/blueprints/payroll/routes.py + schemas.py:
// - Mọi endpoint dưới đây CHỈ admin/hr (WRITE_ROLES) — vai trò khác nhận
//   403, kể cả GET /payroll/periods (xem docs/mobile-api-map.md).
// - Kỳ lương (period_to_dict): { id, month, year, standard_workdays,
//   status: draft|locked, locked_at, locked_by, created_at, updated_at }.
// - POST /payroll/periods/{id}/calculate: KHÔNG cần body; trả
//   { data: { period_id, month, year, status, items_created,
//   items_updated, skipped_no_contract, total_salary, period } }.
//   Kỳ đã chốt -> 409 PERIOD_LOCKED.
// - POST /payroll/periods/{id}/lock: không cần body; trả { data: period }.
//   Chốt trùng -> 409 PERIOD_ALREADY_LOCKED.
// - GET /payroll/periods/{id}/items: { data: [item], meta } — item khớp
//   item_to_dict (cùng shape phiếu lương cá nhân).
// Mọi response bọc trong { data: ... }.
// ---------------------------------------------------------------------------

@JsonClass(generateAdapter = false)
data class AdminPeriodDto(
    val id: Int? = null,
    val month: Int? = null,
    val year: Int? = null,
    @Json(name = "standard_workdays") val standardWorkdays: Double? = null,
    val status: String? = null,
    @Json(name = "locked_at") val lockedAt: String? = null,
    @Json(name = "locked_by") val lockedBy: Int? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class AdminPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class AdminPeriodsResponse(
    val data: List<AdminPeriodDto>? = null,
    val meta: AdminPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class AdminPeriodRefDto(
    val month: Int? = null,
    val year: Int? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = false)
data class AdminPayrollItemDto(
    val id: Int? = null,
    @Json(name = "period_id") val periodId: Int? = null,
    val period: AdminPeriodRefDto? = null,
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
    val currency: String? = null,
)

@JsonClass(generateAdapter = false)
data class AdminItemsResponse(
    val data: List<AdminPayrollItemDto>? = null,
    val meta: AdminPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class CalculateSummaryDto(
    @Json(name = "period_id") val periodId: Int? = null,
    val month: Int? = null,
    val year: Int? = null,
    val status: String? = null,
    @Json(name = "items_created") val itemsCreated: Int? = null,
    @Json(name = "items_updated") val itemsUpdated: Int? = null,
    @Json(name = "skipped_no_contract") val skippedNoContract: Int? = null,
    @Json(name = "total_salary") val totalSalary: Long? = null,
    val period: AdminPeriodDto? = null,
)

@JsonClass(generateAdapter = false)
data class CalculateResponse(
    val data: CalculateSummaryDto? = null,
)

@JsonClass(generateAdapter = false)
data class LockResponse(
    val data: AdminPeriodDto? = null,
)

interface PayrollAdminApi {
    @GET("payroll/periods")
    suspend fun periods(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): AdminPeriodsResponse

    @GET("payroll/periods/{id}/items")
    suspend fun periodItems(
        @Path("id") periodId: Int,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 200,
    ): AdminItemsResponse

    @POST("payroll/periods/{id}/calculate")
    suspend fun calculate(@Path("id") periodId: Int): CalculateResponse

    @POST("payroll/periods/{id}/lock")
    suspend fun lock(@Path("id") periodId: Int): LockResponse
}
