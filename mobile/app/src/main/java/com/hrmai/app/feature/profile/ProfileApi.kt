package com.hrmai.app.feature.profile

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Path

// ---------------------------------------------------------------------------
// DTO — khớp server:
// - GET employees/{id}: { data: employee_to_dict } (employees/schemas.py):
//   { id, code, full_name, email, phone, date_of_birth, gender, address,
//     department_id, department_name, position_id, position_title,
//     manager_id, manager_name, start_date, status, avatar_url }.
// - GET skills/employees/{id}: { data: { employee: {...}, items: [
//   employee_skill_to_dict ] } } (skills/routes.py + services web:
//   items = { skill_id, skill_name, category, level }).
// ---------------------------------------------------------------------------

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
    @Json(name = "department_name") val departmentName: String? = null,
    @Json(name = "position_title") val positionTitle: String? = null,
    @Json(name = "manager_name") val managerName: String? = null,
    @Json(name = "start_date") val startDate: String? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeResponse(
    val data: EmployeeDto? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeSkillDto(
    @Json(name = "skill_id") val skillId: Int? = null,
    @Json(name = "skill_name") val skillName: String? = null,
    val category: String? = null,
    val level: Int? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeSkillsData(
    val items: List<EmployeeSkillDto>? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeSkillsResponse(
    val data: EmployeeSkillsData? = null,
)

interface ProfileApi {
    @GET("employees/{id}")
    suspend fun employee(@Path("id") id: Int): EmployeeResponse

    @GET("skills/employees/{id}")
    suspend fun employeeSkills(@Path("id") id: Int): EmployeeSkillsResponse
}
