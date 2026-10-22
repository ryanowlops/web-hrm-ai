package com.hrmai.app.feature.onboarding

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path

/**
 * DTO + Retrofit API cho module Hội nhập (onboarding).
 * Field khớp server/app/blueprints/onboarding/schemas.py:
 * - Mọi response đều bọc trong { data } (plans kèm meta phân trang).
 * - GET my-plan: data có thể là null khi nhân viên chưa có kế hoạch.
 * - Task.status là trạng thái HIỂN THỊ phía server: việc chưa xong mà
 *   quá hạn sẽ trả "overdue" dù stored_status vẫn là "pending".
 * - PATCH tasks/{id} chỉ đặt được status thuộc SETTABLE_STATUSES:
 *   pending / in_progress / done / skipped (verified do HR xác nhận).
 */

@JsonClass(generateAdapter = false)
data class OnboardingTaskDto(
    val id: Int? = null,
    @Json(name = "plan_id") val planId: Int? = null,
    @Json(name = "plan_employee_id") val planEmployeeId: Int? = null,
    @Json(name = "plan_employee_name") val planEmployeeName: String? = null,
    val title: String? = null,
    val description: String? = null,
    @Json(name = "assignee_id") val assigneeId: Int? = null,
    @Json(name = "assignee_name") val assigneeName: String? = null,
    @Json(name = "assignee_role") val assigneeRole: String? = null,
    @Json(name = "due_date") val dueDate: String? = null,
    @Json(name = "task_type") val taskType: String? = null,
    /** Trạng thái hiển thị (có thể là "overdue"). */
    val status: String? = null,
    @Json(name = "stored_status") val storedStatus: String? = null,
    @Json(name = "is_overdue") val isOverdue: Boolean? = null,
    /** before / first_day / first_week — dùng để gom nhóm theo giai đoạn. */
    val stage: String? = null,
    @Json(name = "completed_at") val completedAt: String? = null,
    @Json(name = "completed_by_name") val completedByName: String? = null,
    val note: String? = null,
)

@JsonClass(generateAdapter = false)
data class OnboardingPlanDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "employee_code") val employeeCode: String? = null,
    @Json(name = "employee_email") val employeeEmail: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    @Json(name = "position_title") val positionTitle: String? = null,
    @Json(name = "template_id") val templateId: Int? = null,
    @Json(name = "template_name") val templateName: String? = null,
    @Json(name = "start_date") val startDate: String? = null,
    val status: String? = null,
    @Json(name = "progress_percent") val progressPercent: Int? = null,
    @Json(name = "total_tasks") val totalTasks: Int? = null,
    @Json(name = "done_tasks") val doneTasks: Int? = null,
    @Json(name = "overdue_tasks") val overdueTasks: Int? = null,
    /** Chỉ có ở my-plan và plans/{id} (include_tasks=True). */
    val tasks: List<OnboardingTaskDto>? = null,
)

@JsonClass(generateAdapter = false)
data class OnboardingPlanResponse(
    val data: OnboardingPlanDto? = null,
)

@JsonClass(generateAdapter = false)
data class OnboardingPlansResponse(
    val data: List<OnboardingPlanDto>? = null,
)

@JsonClass(generateAdapter = false)
data class OnboardingTasksResponse(
    val data: List<OnboardingTaskDto>? = null,
)

@JsonClass(generateAdapter = false)
data class OnboardingTaskResponse(
    val data: OnboardingTaskDto? = null,
)

@JsonClass(generateAdapter = false)
data class UpdateOnboardingTaskBody(
    val status: String? = null,
    val note: String? = null,
)

interface OnboardingApi {
    @GET("onboarding/my-plan")
    suspend fun getMyPlan(): OnboardingPlanResponse

    @GET("onboarding/my-tasks")
    suspend fun getMyTasks(): OnboardingTasksResponse

    @GET("onboarding/plans")
    suspend fun getPlans(): OnboardingPlansResponse

    @GET("onboarding/plans/{id}")
    suspend fun getPlanDetail(@Path("id") id: Int): OnboardingPlanResponse

    @PATCH("onboarding/tasks/{id}")
    suspend fun updateTask(
        @Path("id") id: Int,
        @Body body: UpdateOnboardingTaskBody,
    ): OnboardingTaskResponse
}
