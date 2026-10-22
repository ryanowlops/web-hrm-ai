package com.hrmai.app.feature.leave

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Nghỉ phép.
 * Field khớp server/app/blueprints/leave/schemas.py:
 * - GET types/balance/requests bọc trong { data, meta? }.
 * - POST requests / cancel / manager-decision / hr-decision trả THẲNG
 *   object đơn nghỉ (không bọc data) — xem routes.py của module leave.
 * Vòng đời trạng thái (services.py): pending -> manager_approved ->
 * approved | rejected; pending -> cancelled (chủ đơn huỷ, CHỈ khi pending).
 */

@JsonClass(generateAdapter = false)
data class LeaveTypeDto(
    val id: Int? = null,
    val name: String? = null,
    val paid: Boolean? = null,
    @Json(name = "annual_quota_days") val annualQuotaDays: Double? = null,
)

@JsonClass(generateAdapter = false)
data class LeaveTypesResponse(
    val data: List<LeaveTypeDto>? = null,
)

@JsonClass(generateAdapter = false)
data class LeaveBalanceDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "leave_type_id") val leaveTypeId: Int? = null,
    @Json(name = "leave_type_name") val leaveTypeName: String? = null,
    val year: Int? = null,
    @Json(name = "total_days") val totalDays: Double? = null,
    @Json(name = "used_days") val usedDays: Double? = null,
    @Json(name = "remaining_days") val remainingDays: Double? = null,
)

@JsonClass(generateAdapter = false)
data class LeaveBalancesResponse(
    val data: List<LeaveBalanceDto>? = null,
)

@JsonClass(generateAdapter = false)
data class LeaveRequestDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "leave_type_id") val leaveTypeId: Int? = null,
    @Json(name = "leave_type_name") val leaveTypeName: String? = null,
    @Json(name = "from_date") val fromDate: String? = null,
    @Json(name = "to_date") val toDate: String? = null,
    @Json(name = "days_count") val daysCount: Double? = null,
    val reason: String? = null,
    val status: String? = null,
    @Json(name = "manager_decision") val managerDecision: String? = null,
    @Json(name = "manager_note") val managerNote: String? = null,
    @Json(name = "hr_decision") val hrDecision: String? = null,
    @Json(name = "hr_note") val hrNote: String? = null,
    @Json(name = "decided_at") val decidedAt: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class LeavePageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class LeaveRequestsResponse(
    val data: List<LeaveRequestDto>? = null,
    val meta: LeavePageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class CreateLeaveRequestBody(
    @Json(name = "leave_type_id") val leaveTypeId: Int,
    @Json(name = "from_date") val fromDate: String,
    @Json(name = "to_date") val toDate: String,
    val reason: String,
)

@JsonClass(generateAdapter = false)
data class DecisionBody(
    val decision: String,
    val note: String? = null,
)

interface LeaveApi {
    @GET("leave/types")
    suspend fun getTypes(): LeaveTypesResponse

    @GET("leave/balance/me")
    suspend fun getMyBalances(@Query("year") year: Int?): LeaveBalancesResponse

    @GET("leave/requests")
    suspend fun getRequests(
        @Query("scope") scope: String?,
        @Query("status") status: String?,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): LeaveRequestsResponse

    @POST("leave/requests")
    suspend fun createRequest(@Body body: CreateLeaveRequestBody): LeaveRequestDto

    @POST("leave/requests/{id}/cancel")
    suspend fun cancelRequest(@Path("id") id: Int): LeaveRequestDto

    @POST("leave/requests/{id}/manager-decision")
    suspend fun managerDecision(
        @Path("id") id: Int,
        @Body body: DecisionBody,
    ): LeaveRequestDto

    @POST("leave/requests/{id}/hr-decision")
    suspend fun hrDecision(
        @Path("id") id: Int,
        @Body body: DecisionBody,
    ): LeaveRequestDto
}
