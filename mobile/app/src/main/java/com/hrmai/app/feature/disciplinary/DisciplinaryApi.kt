package com.hrmai.app.feature.disciplinary

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho module Kỷ luật nhân viên (disciplinary).
 * Field khớp server/app/blueprints/disciplinary/schemas.py (record_to_dict):
 * - Response trả camelCase (id, employeeId, employeeName, issuedDate...).
 * - Request tạo/giải quyết dùng snake_case như web gửi
 *   (employee_id, action_taken, issued_date, resolved_note).
 * - GET list -> { data: [...], meta: { page, limit, totalItems, totalPages } },
 *   lọc ?status=active|resolved, ?severity=low|medium|high.
 * - Phạm vi dữ liệu do server scope theo vai trò: admin/hr xem tất cả,
 *   manager xem phòng mình, employee chỉ thấy biên bản của mình.
 * - Không có xóa — chỉ giải quyết bằng ghi chú (resolve).
 */

@JsonClass(generateAdapter = false)
data class DisciplinaryRecordDto(
    val id: Int? = null,
    val employeeId: Int? = null,
    val employeeCode: String? = null,
    val employeeName: String? = null,
    val departmentId: Int? = null,
    val departmentName: String? = null,
    /** verbal / written / final / suspension. */
    val type: String? = null,
    /** low / medium / high. */
    val severity: String? = null,
    val title: String? = null,
    val description: String? = null,
    val actionTaken: String? = null,
    val issuedBy: Int? = null,
    val issuedByName: String? = null,
    /** Ngày lập biên bản, ISO "YYYY-MM-DD". */
    val issuedDate: String? = null,
    /** active / resolved. */
    val status: String? = null,
    val resolvedNote: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class DisciplinaryPageMeta(
    val page: Int? = null,
    val limit: Int? = null,
    val totalItems: Int? = null,
    val totalPages: Int? = null,
)

@JsonClass(generateAdapter = false)
data class DisciplinaryListResponse(
    val data: List<DisciplinaryRecordDto>? = null,
    val meta: DisciplinaryPageMeta? = null,
)

@JsonClass(generateAdapter = false)
data class DisciplinaryDetailResponse(
    val data: DisciplinaryRecordDto? = null,
)

@JsonClass(generateAdapter = false)
data class CreateDisciplinaryRequest(
    @Json(name = "employee_id") val employeeId: Int,
    val type: String,
    val severity: String,
    val title: String,
    val description: String? = null,
    @Json(name = "action_taken") val actionTaken: String? = null,
    /** ISO "YYYY-MM-DD"; null -> server mặc định hôm nay. */
    @Json(name = "issued_date") val issuedDate: String? = null,
)

@JsonClass(generateAdapter = false)
data class ResolveDisciplinaryRequest(
    @Json(name = "resolved_note") val resolvedNote: String? = null,
)

/** Nhân viên để chọn trong form lập biên bản (GET employees, limit 100). */
@JsonClass(generateAdapter = false)
data class DisciplinaryEmployeeDto(
    val id: Int? = null,
    val code: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    @Json(name = "department_name") val departmentName: String? = null,
)

@JsonClass(generateAdapter = false)
data class DisciplinaryEmployeesResponse(
    val data: List<DisciplinaryEmployeeDto>? = null,
)

/** Loại kỷ luật — khớp DisciplinaryRecord.TYPES phía server và nhãn bản web. */
object DisciplinaryTypes {
    val options: List<Pair<String, String>> = listOf(
        "verbal" to "Khiển trách bằng lời",
        "written" to "Khiển trách bằng văn bản",
        "final" to "Cảnh cáo cuối",
        "suspension" to "Đình chỉ",
    )

    fun labelOf(value: String?): String =
        options.firstOrNull { it.first == value }?.second ?: (value ?: "—")
}

/** Mức độ kỷ luật — khớp DisciplinaryRecord.SEVERITIES phía server. */
object DisciplinarySeverities {
    val options: List<Pair<String, String>> = listOf(
        "low" to "Nhẹ",
        "medium" to "Trung bình",
        "high" to "Nghiêm trọng",
    )

    fun labelOf(value: String?): String =
        options.firstOrNull { it.first == value }?.second ?: (value ?: "—")
}

/** Trạng thái biên bản — khớp DisciplinaryRecord.STATUSES phía server. */
object DisciplinaryStatuses {
    val options: List<Pair<String, String>> = listOf(
        "active" to "Đang hiệu lực",
        "resolved" to "Đã giải quyết",
    )

    fun labelOf(value: String?): String =
        options.firstOrNull { it.first == value }?.second ?: (value ?: "—")
}

interface DisciplinaryApi {
    @GET("disciplinary")
    suspend fun getRecords(
        @Query("status") status: String?,
        @Query("severity") severity: String?,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 100,
    ): DisciplinaryListResponse

    @GET("disciplinary/{id}")
    suspend fun getRecord(@Path("id") id: Int): DisciplinaryDetailResponse

    @POST("disciplinary")
    suspend fun createRecord(@Body body: CreateDisciplinaryRequest): DisciplinaryDetailResponse

    @POST("disciplinary/{id}/resolve")
    suspend fun resolveRecord(
        @Path("id") id: Int,
        @Body body: ResolveDisciplinaryRequest,
    ): DisciplinaryDetailResponse

    @GET("employees")
    suspend fun getEmployees(@Query("limit") limit: Int = 100): DisciplinaryEmployeesResponse
}
