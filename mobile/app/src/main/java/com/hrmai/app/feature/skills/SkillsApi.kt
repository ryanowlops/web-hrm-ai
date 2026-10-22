package com.hrmai.app.feature.skills

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * DTO + Retrofit API cho Bản đồ kỹ năng (blueprint skills).
 * Field khớp server/app/blueprints/skills/schemas.py + routes.py:
 * - GET skills: `data` là LIST TRẦN (không lồng thêm object), kèm meta.
 * - GET skills/matrix: data = { departments: [{id, name}], rows: [
 *   { skill, cells: { "<department_id>": { avg_level, headcount } | null } } ] }
 *   — ô null nghĩa là phòng ban chưa có ai sở hữu kỹ năng (khác mức 0).
 * - GET skills/employees/{id}: data = { employee, items } — mức 1..5.
 * - POST skills/employees/{id}/suggest: data là list gợi ý khoá học,
 *   meta.source = "ai" | "keyword" cho biết nguồn xếp hạng.
 */

@JsonClass(generateAdapter = false)
data class SkillDto(
    val id: Int? = null,
    val name: String? = null,
    val category: String? = null,
    val description: String? = null,
    @Json(name = "holder_count") val holderCount: Int? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class SkillsMeta(
    val totalItems: Int? = null,
    val source: String? = null,
)

@JsonClass(generateAdapter = false)
data class SkillsListResponse(
    val data: List<SkillDto>? = null,
    val meta: SkillsMeta? = null,
)

@JsonClass(generateAdapter = false)
data class SkillDepartmentDto(
    val id: Int? = null,
    val name: String? = null,
)

@JsonClass(generateAdapter = false)
data class MatrixCellDto(
    @Json(name = "avg_level") val avgLevel: Double? = null,
    val headcount: Int? = null,
)

@JsonClass(generateAdapter = false)
data class MatrixRowDto(
    val skill: SkillDto? = null,
    /** Key là department_id dạng chuỗi; value null = chưa ai có kỹ năng này. */
    val cells: Map<String, MatrixCellDto?>? = null,
)

@JsonClass(generateAdapter = false)
data class MatrixDataDto(
    val departments: List<SkillDepartmentDto>? = null,
    val rows: List<MatrixRowDto>? = null,
)

@JsonClass(generateAdapter = false)
data class MatrixResponse(
    val data: MatrixDataDto? = null,
)

@JsonClass(generateAdapter = false)
data class SkillEmployeeBriefDto(
    val id: Int? = null,
    val code: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    @Json(name = "position_id") val positionId: Int? = null,
    @Json(name = "position_name") val positionName: String? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeSkillDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "skill_id") val skillId: Int? = null,
    @Json(name = "skill_name") val skillName: String? = null,
    val category: String? = null,
    val level: Int? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeSkillsDataDto(
    val employee: SkillEmployeeBriefDto? = null,
    val items: List<EmployeeSkillDto>? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeeSkillsResponse(
    val data: EmployeeSkillsDataDto? = null,
)

@JsonClass(generateAdapter = false)
data class SuggestionCourseDto(
    val id: Int? = null,
    val title: String? = null,
)

@JsonClass(generateAdapter = false)
data class CourseSuggestionDto(
    /** Tên kỹ năng cần bồi dưỡng (server trả chuỗi tên, không phải object). */
    val skill: String? = null,
    @Json(name = "current_level") val currentLevel: Int? = null,
    val course: SuggestionCourseDto? = null,
    val reason: String? = null,
)

@JsonClass(generateAdapter = false)
data class SuggestResponse(
    val data: List<CourseSuggestionDto>? = null,
    val meta: SkillsMeta? = null,
)

interface SkillsApi {
    @GET("skills")
    suspend fun listSkills(): SkillsListResponse

    @GET("skills/matrix")
    suspend fun getMatrix(): MatrixResponse

    @GET("skills/employees/{id}")
    suspend fun getEmployeeSkills(@Path("id") employeeId: Int): EmployeeSkillsResponse

    @POST("skills/employees/{id}/suggest")
    suspend fun suggestCourses(@Path("id") employeeId: Int): SuggestResponse
}
