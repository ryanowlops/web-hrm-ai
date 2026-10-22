package com.hrmai.app.feature.jd

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * DTO + Retrofit API cho tính năng AI tạo JD (feature-expansion-v6 mục 2).
 *
 * Khớp server/app/blueprints/recruitment/routes.py + jd_service.py:
 * - POST /jd/generate — CHỈ hr/admin (require_roles), trả { data: {...} }.
 * - Request theo JdGenerateSchema (schemas.py): title bắt buộc (1–200 ký
 *   tự); department_name tuỳ chọn (<= 200); level thuộc JD_LEVELS;
 *   skills là List[String] (mỗi kỹ năng <= 80 ký tự, server tự cắt tối đa
 *   10); salary_note tuỳ chọn (<= 300). App gửi department_name (tên tự do)
 *   thay vì department_id.
 * - Response data: { summary, responsibilities[], requirements[],
 *   benefits[], source: "ai" | "template", title, level } — level là mã
 *   server đã chuẩn hoá (thiếu/sai thì server tự rơi về "middle").
 * JD chỉ là bản soạn thảo cho HR xem trước/sao chép — endpoint này KHÔNG
 * tạo JobPosting.
 */

/** Cấp bậc hợp lệ theo JD_LEVELS (schemas.py) + nhãn theo LEVELS (jd_service.py). */
data class JdLevel(val value: String, val label: String)

val JD_LEVELS: List<JdLevel> = listOf(
    JdLevel("intern", "Thực tập sinh"),
    JdLevel("fresher", "Mới tốt nghiệp (Fresher)"),
    JdLevel("junior", "Junior"),
    JdLevel("middle", "Middle"),
    JdLevel("senior", "Senior"),
    JdLevel("lead", "Team Lead"),
    JdLevel("manager", "Quản lý (Manager)"),
)

/** Cấp bậc mặc định — khớp DEFAULT_LEVEL = "middle" phía server. */
const val JD_DEFAULT_LEVEL = "middle"

fun jdLevelLabel(value: String?): String =
    JD_LEVELS.firstOrNull { it.value == value }?.label ?: "Middle"

@JsonClass(generateAdapter = false)
data class JdGenerateRequest(
    val title: String,
    @Json(name = "department_name") val departmentName: String? = null,
    val level: String? = null,
    val skills: List<String> = emptyList(),
    @Json(name = "salary_note") val salaryNote: String? = null,
)

@JsonClass(generateAdapter = false)
data class JdResultDto(
    val summary: String? = null,
    val responsibilities: List<String>? = null,
    val requirements: List<String>? = null,
    val benefits: List<String>? = null,
    /** "ai" = AI viết thật, "template" = bản mẫu tự động khi AI không khả dụng. */
    val source: String? = null,
    val title: String? = null,
    val level: String? = null,
)

@JsonClass(generateAdapter = false)
data class JdGenerateResponse(
    val data: JdResultDto? = null,
)

interface JdApi {
    @POST("jd/generate")
    suspend fun generate(@Body body: JdGenerateRequest): JdGenerateResponse
}

/**
 * Ghép JD thành văn bản thuần để sao chép — theo đúng định dạng bản web
 * (RecruitmentPage.jsx handleApplyJd): summary trước, rồi từng mục dạng
 * "Tiêu mục:\n- dòng" cách nhau một dòng trống.
 */
fun JdResultDto.toPlainText(): String {
    fun lines(items: List<String>?): List<String> =
        (items ?: emptyList()).map { it.trim() }.filter { it.isNotEmpty() }

    val resp = lines(responsibilities)
    val req = lines(requirements)
    val benefitsLines = lines(benefits)
    return listOf(
        (summary ?: "").trim(),
        if (resp.isNotEmpty()) {
            "Trách nhiệm chính:\n" + resp.joinToString("\n") { "- $it" }
        } else {
            ""
        },
        if (req.isNotEmpty()) {
            "Yêu cầu:\n" + req.joinToString("\n") { "- $it" }
        } else {
            ""
        },
        if (benefitsLines.isNotEmpty()) {
            "Quyền lợi:\n" + benefitsLines.joinToString("\n") { "- $it" }
        } else {
            ""
        },
    ).filter { it.isNotBlank() }.joinToString("\n\n")
}
