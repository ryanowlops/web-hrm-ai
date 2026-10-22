package com.hrmai.app.feature.offboarding

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Nghỉ việc (offboarding).
 * Field khớp server/app/blueprints/offboarding/schemas.py:
 * - Mọi response đều bọc trong { data } (danh sách kèm meta phân trang).
 * - Process.progress_percent do server tính = task is_done / tổng task.
 * - PATCH tasks/{id} nhận { is_done?, note? } — tick bàn giao.
 * - Phạm vi dữ liệu do server scope theo vai trò: HR/Admin xem tất cả,
 *   Manager xem nhân viên mình phụ trách, Employee chỉ thấy của mình
 *   (app chỉ mở mục này cho HR/quản lý theo phân quyền tính năng).
 */

@JsonClass(generateAdapter = false)
data class OffboardingTaskDto(
    val id: Int? = null,
    @Json(name = "process_id") val processId: Int? = null,
    @Json(name = "process_employee_id") val processEmployeeId: Int? = null,
    val title: String? = null,
    /** assets / it / hr / finance / knowledge / other. */
    val category: String? = null,
    @Json(name = "assignee_role") val assigneeRole: String? = null,
    @Json(name = "is_done") val isDone: Boolean? = null,
    @Json(name = "done_by") val doneBy: Int? = null,
    @Json(name = "done_by_name") val doneByName: String? = null,
    @Json(name = "done_at") val doneAt: String? = null,
    val note: String? = null,
    @Json(name = "sort_order") val sortOrder: Int? = null,
)

@JsonClass(generateAdapter = false)
data class OffboardingProcessDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "employee_code") val employeeCode: String? = null,
    @Json(name = "employee_email") val employeeEmail: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    @Json(name = "position_title") val positionTitle: String? = null,
    @Json(name = "last_working_day") val lastWorkingDay: String? = null,
    val reason: String? = null,
    /** in_progress / completed / cancelled. */
    val status: String? = null,
    @Json(name = "initiated_by_name") val initiatedByName: String? = null,
    @Json(name = "completed_at") val completedAt: String? = null,
    @Json(name = "progress_percent") val progressPercent: Int? = null,
    @Json(name = "total_tasks") val totalTasks: Int? = null,
    @Json(name = "done_tasks") val doneTasks: Int? = null,
    /** Chỉ có ở chi tiết process (include_tasks=True). */
    val tasks: List<OffboardingTaskDto>? = null,
    @Json(name = "created_at") val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class OffboardingListResponse(
    val data: List<OffboardingProcessDto>? = null,
)

@JsonClass(generateAdapter = false)
data class OffboardingProcessResponse(
    val data: OffboardingProcessDto? = null,
)

@JsonClass(generateAdapter = false)
data class OffboardingTaskResponse(
    val data: OffboardingTaskDto? = null,
)

@JsonClass(generateAdapter = false)
data class UpdateOffboardingTaskBody(
    @Json(name = "is_done") val isDone: Boolean? = null,
    val note: String? = null,
)

interface OffboardingApi {
    @GET("offboarding")
    suspend fun getProcesses(@Query("status") status: String?): OffboardingListResponse

    @GET("offboarding/{id}")
    suspend fun getProcessDetail(@Path("id") id: Int): OffboardingProcessResponse

    @PATCH("offboarding/tasks/{id}")
    suspend fun updateTask(
        @Path("id") id: Int,
        @Body body: UpdateOffboardingTaskBody,
    ): OffboardingTaskResponse
}
