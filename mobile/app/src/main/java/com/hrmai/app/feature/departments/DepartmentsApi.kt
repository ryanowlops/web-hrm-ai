package com.hrmai.app.feature.departments

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Phòng ban.
 * Field khớp server/app/blueprints/departments/schemas.py (department_to_dict):
 * - GET org/departments -> { data: [...], meta: { page, limit, totalItems, totalPages } }
 *   (blueprint departments gắn ở tiền tố /org, route con là /departments).
 * - employee_count: số nhân viên của phòng do server đếm sẵn;
 *   manager_name: họ tên trưởng phòng (có thể null).
 */

@JsonClass(generateAdapter = false)
data class DepartmentDto(
    val id: Int? = null,
    val name: String? = null,
    @Json(name = "manager_id") val managerId: Int? = null,
    @Json(name = "manager_name") val managerName: String? = null,
    val description: String? = null,
    @Json(name = "employee_count") val employeeCount: Int? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class DepartmentsPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class DepartmentsResponse(
    val data: List<DepartmentDto>? = null,
    val meta: DepartmentsPageMeta? = null,
)

interface DepartmentsApi {
    @GET("org/departments")
    suspend fun getDepartments(
        @Query("page") page: Int,
        @Query("limit") limit: Int,
        @Query("sortBy") sortBy: String? = "name",
        @Query("sortOrder") sortOrder: String? = "asc",
    ): DepartmentsResponse
}
