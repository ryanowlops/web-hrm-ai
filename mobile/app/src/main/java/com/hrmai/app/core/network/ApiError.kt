package com.hrmai.app.core.network

import org.json.JSONObject
import retrofit2.HttpException
import java.io.IOException

/** Lỗi API đã chuẩn hoá: message luôn là tiếng Việt thân thiện để hiện lên UI. */
class ApiException(
    val httpStatus: Int?,
    val code: String?,
    override val message: String,
) : Exception(message)

/** Đọc thân lỗi chuẩn của server: { error: { code, message, details } }. */
fun Throwable.toApiException(): ApiException = when (this) {
    is ApiException -> this
    is HttpException -> {
        val raw = runCatching { response()?.errorBody()?.string() }.getOrNull()
        var code: String? = null
        var msg: String? = null
        if (raw != null) {
            runCatching {
                val err = JSONObject(raw).optJSONObject("error")
                code = err?.optString("code")?.takeIf { it.isNotBlank() }
                msg = err?.optString("message")?.takeIf { it.isNotBlank() }
            }
        }
        ApiException(
            httpStatus = code(),
            code = code,
            message = msg ?: defaultMessageFor(code()),
        )
    }
    is IOException -> ApiException(null, "NETWORK", "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại nhé.")
    else -> ApiException(null, "UNKNOWN", message ?: "Đã có lỗi xảy ra, thử lại sau nhé.")
}

private fun defaultMessageFor(status: Int): String = when (status) {
    400 -> "Dữ liệu chưa hợp lệ, kiểm tra lại giúp em."
    401 -> "Phiên đăng nhập đã hết hạn, đăng nhập lại nhé."
    403 -> "Bạn không có quyền thực hiện thao tác này."
    404 -> "Không tìm thấy dữ liệu."
    409 -> "Thao tác xung đột với dữ liệu hiện tại."
    422 -> "Dữ liệu chưa hợp lệ, kiểm tra lại giúp em."
    429 -> "Bạn thao tác hơi nhanh, chờ một chút rồi thử lại."
    else -> "Máy chủ đang bận (mã $status), thử lại sau ít phút."
}
