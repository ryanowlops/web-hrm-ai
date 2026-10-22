package com.hrmai.app.feature.checkin

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * DTO + Retrofit API cho module Chấm công QR + GPS (phía nhân viên).
 * Field khớp server/app/blueprints/checkin/routes.py + schemas.py:
 * - POST checkin/scan (JWT, mọi role có hồ sơ nhân viên) body
 *   { date: "YYYY-MM-DD", token, lat?, lon? } -> 201 { data: {...} }.
 * - token là 12 ký tự hex trong mã QR (bắt buộc kèm lat/lon) hoặc mã
 *   dự phòng 6 chữ số (server KHÔNG kiểm khoảng cách).
 * - Lỗi chuẩn { error: { code, message, details } }: 403 INVALID_QR_CODE,
 *   400 GPS_REQUIRED, 400 OFFICE_NOT_CONFIGURED, 403 OUT_OF_RANGE
 *   (message đã chứa khoảng cách thật), 409 ALREADY_CHECKED_IN —
 *   đọc qua Throwable.toApiException().
 */

@JsonClass(generateAdapter = false)
data class ScanRequestBody(
    /** Ngày trên mã QR (YYYY-MM-DD, giờ ICT) — server chỉ chấp nhận hôm nay. */
    val date: String,
    /** Token 12 ký tự hex của mã QR, hoặc mã dự phòng 6 chữ số. */
    val token: String,
    /** Vĩ độ hiện tại — bắt buộc với luồng QR, bỏ trống với mã 6 số. */
    val lat: Double? = null,
    /** Kinh độ hiện tại — bắt buộc với luồng QR, bỏ trống với mã 6 số. */
    val lon: Double? = null,
)

@JsonClass(generateAdapter = false)
data class ScanResponseDto(
    val data: ScanResultDto? = null,
)

@JsonClass(generateAdapter = false)
data class ScanResultDto(
    val attendance: CheckinAttendanceDto? = null,
    /** Khoảng cách tới văn phòng (mét) do server tự tính; null ở luồng mã 6 số. */
    @Json(name = "distance_m") val distanceM: Int? = null,
    /** "qr_gps" (quét QR + GPS) hoặc "qr_code" (mã dự phòng 6 số). */
    val method: String? = null,
    /** Câu thông báo sẵn của server, hiển thị nguyên văn. */
    val message: String? = null,
)

/** Bản ghi chấm công rút gọn trong kết quả scan (khớp AttendanceSchema). */
@JsonClass(generateAdapter = false)
data class CheckinAttendanceDto(
    @Json(name = "employee_name") val employeeName: String? = null,
    @Json(name = "work_date") val workDate: String? = null,
    @Json(name = "check_in_at") val checkInAt: String? = null,
    @Json(name = "check_out_at") val checkOutAt: String? = null,
    /** "present" (đúng giờ) | "late" (đi muộn). */
    val status: String? = null,
    val note: String? = null,
)

interface CheckinApi {
    @POST("checkin/scan")
    suspend fun scan(@Body body: ScanRequestBody): ScanResponseDto
}
