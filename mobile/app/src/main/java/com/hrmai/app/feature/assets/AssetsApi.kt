package com.hrmai.app.feature.assets

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Tài sản (blueprint assets, prefix /api/v1).
 * Nguồn sự thật: server/app/blueprints/assets/routes.py + schemas.py.
 * - GET assets/my: mọi role; mỗi dòng là tài sản + assignment_id/assigned_at
 *   của chính mình (serializer my_asset_to_dict).
 * - GET assets: chỉ admin/hr/manager (employee gọi sẽ 403); kèm holder là
 *   người đang giữ (nếu có).
 * - Cấp phát/thu hồi: chỉ admin/hr. Cấp phát body { employee_id, note? };
 *   thu hồi POST assets/assignments/{assignment_id}/return, body { note? }.
 * Mọi response bọc { data, meta? }.
 */

@JsonClass(generateAdapter = false)
data class AssetHolderDto(
    @Json(name = "assignment_id") val assignmentId: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "employee_code") val employeeCode: String? = null,
    @Json(name = "assigned_at") val assignedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class AssetDto(
    val id: Int? = null,
    val code: String? = null,
    val name: String? = null,
    val category: String? = null,
    val serial: String? = null,
    /** available | assigned | maintenance | retired */
    val status: String? = null,
    @Json(name = "purchase_date") val purchaseDate: String? = null,
    val notes: String? = null,
    val holder: AssetHolderDto? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

/** Dòng "tài sản của tôi": asset + thông tin lượt cấp phát của mình. */
@JsonClass(generateAdapter = false)
data class MyAssetDto(
    val id: Int? = null,
    val code: String? = null,
    val name: String? = null,
    val category: String? = null,
    val serial: String? = null,
    val status: String? = null,
    @Json(name = "purchase_date") val purchaseDate: String? = null,
    @Json(name = "assignment_id") val assignmentId: Int? = null,
    @Json(name = "assigned_at") val assignedAt: String? = null,
    @Json(name = "assignment_note") val assignmentNote: String? = null,
)

@JsonClass(generateAdapter = false)
data class AssetAssignmentDto(
    val id: Int? = null,
    @Json(name = "asset_id") val assetId: Int? = null,
    @Json(name = "asset_code") val assetCode: String? = null,
    @Json(name = "asset_name") val assetName: String? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "assigned_at") val assignedAt: String? = null,
    @Json(name = "returned_at") val returnedAt: String? = null,
    /** active | returned */
    val status: String? = null,
    val note: String? = null,
)

/** Nhân viên rút gọn cho hộp thoại chọn người nhận khi cấp phát. */
@JsonClass(generateAdapter = false)
data class EmployeeOptionDto(
    val id: Int? = null,
    val code: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    @Json(name = "department_name") val departmentName: String? = null,
)

@JsonClass(generateAdapter = false)
data class AssetsPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class AssetsResponse(
    val data: List<AssetDto>? = null,
    val meta: AssetsPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class MyAssetsResponse(
    val data: List<MyAssetDto>? = null,
    val meta: AssetsPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class AssignmentSingleResponse(
    val data: AssetAssignmentDto? = null,
)

@JsonClass(generateAdapter = false)
data class EmployeesResponse(
    val data: List<EmployeeOptionDto>? = null,
    val meta: AssetsPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class AssignAssetBody(
    @Json(name = "employee_id") val employeeId: Int,
    val note: String? = null,
)

@JsonClass(generateAdapter = false)
data class ReturnAssetBody(
    val note: String? = null,
)

interface AssetsApi {
    @GET("assets/my")
    suspend fun getMyAssets(): MyAssetsResponse

    @GET("assets")
    suspend fun getAssets(
        @Query("page") page: Int,
        @Query("limit") limit: Int,
        @Query("status") status: String?,
    ): AssetsResponse

    @GET("employees")
    suspend fun getEmployees(
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): EmployeesResponse

    @POST("assets/{id}/assign")
    suspend fun assignAsset(
        @Path("id") assetId: Int,
        @Body body: AssignAssetBody,
    ): AssignmentSingleResponse

    @POST("assets/assignments/{id}/return")
    suspend fun returnAssignment(
        @Path("id") assignmentId: Int,
        @Body body: ReturnAssetBody,
    ): AssignmentSingleResponse
}
