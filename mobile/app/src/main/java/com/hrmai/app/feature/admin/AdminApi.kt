package com.hrmai.app.feature.admin

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho Quản trị tài khoản (blueprint users, chỉ Admin).
 * Shape theo server/app/blueprints/users (UserSchema — snake_case):
 * - GET users: { data: [User], meta: { page, limit, totalItems,
 *   totalPages } } (meta camelCase, khác meta của gamification).
 * - PATCH users/{id}: trả object tài khoản Ở TẦNG CAO NHẤT (không bọc
 *   data). Body chỉ gồm trường cần đổi: role và/hoặc is_active.
 * Server tự chặn Admin khoá chính mình / tự đổi vai trò của mình (400).
 */

@JsonClass(generateAdapter = false)
data class UserDto(
    val id: Int? = null,
    val email: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    val role: String? = null,
    @Json(name = "is_active") val isActive: Boolean? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class UsersMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class UsersResponse(
    val data: List<UserDto>? = null,
    val meta: UsersMeta? = null,
)

/** Vai trò hệ thống (khớp ROLES phía server) kèm nhãn tiếng Việt. */
object UserRoles {
    val options: List<Pair<String, String>> = listOf(
        "admin" to "Quản trị viên",
        "hr" to "Nhân sự (HR)",
        "manager" to "Quản lý",
        "employee" to "Nhân viên",
    )

    fun labelOf(role: String?): String =
        options.firstOrNull { it.first == role }?.second ?: (role ?: "—")
}

interface AdminApi {
    @GET("users")
    suspend fun getUsers(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
        @Query("search") search: String? = null,
    ): UsersResponse

    @PATCH("users/{id}")
    suspend fun updateUser(
        @Path("id") id: Int,
        @Body body: Map<String, Any>,
    ): UserDto
}
