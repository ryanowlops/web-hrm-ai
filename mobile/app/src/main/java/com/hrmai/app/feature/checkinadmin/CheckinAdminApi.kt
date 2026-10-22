package com.hrmai.app.feature.checkinadmin

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * DTO + Retrofit API cho màn hình Mã QR chấm công phía HR.
 * Field khớp server/app/blueprints/checkin/routes.py + schemas.py:
 * - GET checkin/today-qr (hr/admin) -> { data: { date, token, code6, expires_in_s } }
 *   expires_in_s = số giây còn lại tới nửa đêm ICT (lúc mã xoay sang ngày mới).
 * - GET checkin/config (hr/admin) -> { data: { lat, lon, radius_m, configured } }
 *   lat/lon = null khi chưa cấu hình; radius_m mặc định 150 ở server.
 * - PUT checkin/config { lat, lon, radius_m } -> trả lại config sau khi lưu.
 *   Validate server: lat [-90,90], lon [-180,180], radius_m [10,2000].
 * - GET checkin/logs?date=YYYY-MM-DD (hr/admin) -> { data: [...], date }
 *   (date nằm ở cấp trên cùng của response, không bọc trong meta).
 */

@JsonClass(generateAdapter = false)
data class TodayQrDto(
    val date: String? = null,
    val token: String? = null,
    val code6: String? = null,
    @Json(name = "expires_in_s") val expiresInS: Int? = null,
)

@JsonClass(generateAdapter = false)
data class TodayQrResponse(
    val data: TodayQrDto? = null,
)

@JsonClass(generateAdapter = false)
data class OfficeConfigDto(
    val lat: Double? = null,
    val lon: Double? = null,
    @Json(name = "radius_m") val radiusM: Int? = null,
    val configured: Boolean? = null,
)

@JsonClass(generateAdapter = false)
data class OfficeConfigResponse(
    val data: OfficeConfigDto? = null,
)

@JsonClass(generateAdapter = false)
data class UpdateOfficeConfigBody(
    val lat: Double,
    val lon: Double,
    @Json(name = "radius_m") val radiusM: Int?,
)

@JsonClass(generateAdapter = false)
data class CheckinLogDto(
    val id: Int? = null,
    @Json(name = "employee_id") val employeeId: Int? = null,
    @Json(name = "employee_code") val employeeCode: String? = null,
    @Json(name = "employee_name") val employeeName: String? = null,
    val date: String? = null,
    /** qr_gps = quét QR kèm GPS; qr_code = nhập mã dự phòng 6 số. */
    val method: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    @Json(name = "distance_m") val distanceM: Int? = null,
    /** ok | rejected. */
    val result: String? = null,
    val reason: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class CheckinLogsResponse(
    val data: List<CheckinLogDto>? = null,
    val date: String? = null,
)

interface CheckinAdminApi {
    @GET("checkin/today-qr")
    suspend fun getTodayQr(): TodayQrResponse

    @GET("checkin/config")
    suspend fun getConfig(): OfficeConfigResponse

    @PUT("checkin/config")
    suspend fun updateConfig(@Body body: UpdateOfficeConfigBody): OfficeConfigResponse

    @GET("checkin/logs")
    suspend fun getLogs(@Query("date") date: String?): CheckinLogsResponse
}
