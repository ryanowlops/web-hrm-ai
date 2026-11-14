package com.hrmai.app.feature.shiftswaps

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Đổi ca làm việc (prefix /api/v1/shift-swaps).
 * Nguồn sự thật: server/app/blueprints/shift_swaps/{routes.py,schemas.py,services.py}
 * + client/src/features/shift-swaps/{services.js,pages/ShiftSwapsPage.jsx}.
 * Mọi response đều bọc { data, meta? }; serialize camelCase.
 * - Tạo đơn: POST body { target_id, work_date "YYYY-MM-DD", note? }.
 *   Ngày phải từ hôm nay trở đi; một người tối đa một đơn pending/ngày (409).
 * - Duyệt: POST approve (không body) — backend tự hoán đổi ca gán ngày đó
 *   giữa người tạo và người đổi ca (hoặc chuyển ca nếu chỉ một người có ca).
 * - Từ chối: POST reject { note? } — ghi chú không bắt buộc, không ghi đè
 *   ghi chú gốc của người tạo đơn (model chỉ có một cột note).
 * - Hủy: POST cancel (không body) — chỉ người tạo, chỉ khi còn pending.
 * - Quyền duyệt (DECIDE_ROLES): admin/hr/manager; xem/tạo: mọi role đã
 *   đăng nhập (phạm vi xem do server áp: admin/hr toàn công ty, manager
 *   theo phòng, employee đơn mình tạo + đơn chọn mình làm người đổi ca).
 */

@JsonClass(generateAdapter = false)
data class ShiftSwapDto(
    val id: Int? = null,
    val requesterId: Int? = null,
    val requesterName: String? = null,
    val requesterCode: String? = null,
    val requesterDepartment: String? = null,
    val targetId: Int? = null,
    val targetName: String? = null,
    val targetCode: String? = null,
    val targetDepartment: String? = null,
    val workDate: String? = null,
    val status: String? = null,
    val note: String? = null,
    val decidedBy: Int? = null,
    val decidedByName: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class ShiftSwapsPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class ShiftSwapsResponse(
    val data: List<ShiftSwapDto>? = null,
    val meta: ShiftSwapsPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class ShiftSwapSingleResponse(
    val data: ShiftSwapDto? = null,
)

@JsonClass(generateAdapter = false)
data class CreateShiftSwapBody(
    @Json(name = "target_id") val targetId: Int,
    @Json(name = "work_date") val workDate: String,
    val note: String? = null,
)

@JsonClass(generateAdapter = false)
data class ShiftSwapDecisionBody(
    val note: String? = null,
)

/** Đồng nghiệp để chọn đổi ca — giống bản web getEmployees({limit: 100}). */
@JsonClass(generateAdapter = false)
data class SwapColleagueDto(
    val id: Int? = null,
    val code: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    @Json(name = "department_name") val departmentName: String? = null,
)

@JsonClass(generateAdapter = false)
data class SwapColleaguesResponse(
    val data: List<SwapColleagueDto>? = null,
)

interface ShiftSwapsApi {
    @GET("shift-swaps")
    suspend fun getShiftSwaps(
        @Query("status") status: String?,
        @Query("mine") mine: Int?,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): ShiftSwapsResponse

    @GET("shift-swaps/{id}")
    suspend fun getShiftSwap(@Path("id") id: Int): ShiftSwapSingleResponse

    @POST("shift-swaps")
    suspend fun createShiftSwap(@Body body: CreateShiftSwapBody): ShiftSwapSingleResponse

    @POST("shift-swaps/{id}/approve")
    suspend fun approveShiftSwap(@Path("id") id: Int): ShiftSwapSingleResponse

    @POST("shift-swaps/{id}/reject")
    suspend fun rejectShiftSwap(
        @Path("id") id: Int,
        @Body body: ShiftSwapDecisionBody,
    ): ShiftSwapSingleResponse

    @POST("shift-swaps/{id}/cancel")
    suspend fun cancelShiftSwap(@Path("id") id: Int): ShiftSwapSingleResponse

    /** Danh sách đồng nghiệp (GET employees?limit=100, giống bản web). */
    @GET("employees")
    suspend fun getColleagues(@Query("limit") limit: Int = 100): SwapColleaguesResponse
}
