package com.hrmai.app.feature.employees

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Nhân viên (danh sách + chi tiết).
 * Field khớp server/app/blueprints/employees/schemas.py (employee_to_dict):
 * - GET employees       -> { data: [...], meta: { page, limit, totalItems, totalPages } }
 * - GET employees/{id}  -> { data: {...} } (ngoài phạm vi dữ liệu: 404).
 * Phạm vi dữ liệu do server quyết: admin/hr = tất cả, manager = phòng mình,
 * employee = chỉ bản thân. Query hỗ trợ: search (tên/mã/email/SĐT),
 * department_id, status, page, limit (tối đa 100), sortBy/sortOrder.
 */

@JsonClass(generateAdapter = false)
data class EmployeeDto(
    val id: Int? = null,
    val code: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    @Json(name = "date_of_birth") val dateOfBirth: String? = null,
    val gender: String? = null,
    val address: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    @Json(name = "position_id") val positionId: Int? = null,
    @Json(name = "position_title") val positionTitle: String? = null,
    @Json(name = "manager_id") val managerId: Int? = null,
    @Json(name = "manager_name") val managerName: String? = null,
    @Json(name = "start_date") val startDate: String? = null,
    val status: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeesPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeesResponse(
    val data: List<EmployeeDto>? = null,
    val meta: EmployeesPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeDetailResponse(
    val data: EmployeeDto? = null,
)

interface EmployeesApi {
    @GET("employees")
    suspend fun getEmployees(
        @Query("search") search: String?,
        @Query("department_id") departmentId: Int?,
        @Query("status") status: String?,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
        @Query("sortBy") sortBy: String? = "full_name",
        @Query("sortOrder") sortOrder: String? = "asc",
    ): EmployeesResponse

    @GET("employees/{id}")
    suspend fun getEmployee(@Path("id") id: Int): EmployeeDetailResponse
}
