package com.hrmai.app.feature.attrition

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho Rủi ro nghỉ việc (blueprint people_ai).
 * Field khớp server/app/blueprints/people_ai/services.py::get_attrition_risk:
 * - GET people-ai/attrition-risk trả { data: { generated_at, window_days,
 *   items, summary } }; điểm tính TẠI CHỖ theo luật trong cửa sổ 60 ngày,
 *   KHÔNG có bảng lưu trữ riêng.
 * - Item: { employee: {id, code, full_name, department_id, department_name,
 *   position_name}, score (0..100), level: low|medium|high, level_label,
 *   factors: [chuỗi giải thích tiếng Việt kèm (+điểm)] }.
 * - summary { high, medium, low } luôn đếm trên TOÀN BỘ phạm vi, trước khi
 *   lọc theo level.
 * - Chỉ admin/hr/manager gọi được; employee -> 403 ở route. Manager bị
 *   server giới hạn ở nhóm của mình.
 */

@JsonClass(generateAdapter = false)
data class AttritionEmployeeDto(
    val id: Int? = null,
    val code: String? = null,
    @Json(name = "full_name") val fullName: String? = null,
    @Json(name = "department_id") val departmentId: Int? = null,
    @Json(name = "department_name") val departmentName: String? = null,
    @Json(name = "position_name") val positionName: String? = null,
)

@JsonClass(generateAdapter = false)
data class AttritionItemDto(
    val employee: AttritionEmployeeDto? = null,
    val score: Int? = null,
    val level: String? = null,
    @Json(name = "level_label") val levelLabel: String? = null,
    val factors: List<String>? = null,
)

@JsonClass(generateAdapter = false)
data class AttritionSummaryDto(
    val high: Int? = null,
    val medium: Int? = null,
    val low: Int? = null,
)

@JsonClass(generateAdapter = false)
data class AttritionDataDto(
    @Json(name = "generated_at") val generatedAt: String? = null,
    @Json(name = "window_days") val windowDays: Int? = null,
    val items: List<AttritionItemDto>? = null,
    val summary: AttritionSummaryDto? = null,
)

@JsonClass(generateAdapter = false)
data class AttritionResponse(
    val data: AttritionDataDto? = null,
)

interface AttritionApi {
    @GET("people-ai/attrition-risk")
    suspend fun getAttritionRisk(@Query("level") level: String?): AttritionResponse
}
