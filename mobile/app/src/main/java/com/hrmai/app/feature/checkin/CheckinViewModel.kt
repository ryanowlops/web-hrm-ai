package com.hrmai.app.feature.checkin

import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.core.util.Format
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** Giai đoạn của luồng chấm công trên màn hình. */
enum class CheckinPhase {
    IDLE,
    LOCATING,
    SUBMITTING,
    SUCCESS,
    ALREADY,
    ERROR,
}

data class CheckinUiState(
    val phase: CheckinPhase = CheckinPhase.IDLE,
    /** true khi đã có token QR và đang chờ màn hình lo quyền + gọi proceedWithLocation(). */
    val awaitingLocation: Boolean = false,
    /** Kết quả scan thành công (201). */
    val result: ScanResultDto? = null,
    /** Thông điệp thân thiện cho trường hợp 409 (đã chấm công hôm nay rồi). */
    val infoMessage: String? = null,
    /** Lỗi nghiệp vụ từ server (hiện nguyên message) hoặc lỗi parse mã. */
    val errorMessage: String? = null,
    /** Lưu ý mềm: bị từ chối quyền vị trí, GPS tắt/timeout... kèm gợi ý dùng mã 6 số. */
    val notice: String? = null,
    /** Nội dung ô nhập mã thủ công (6 số | token 12 ký tự | cả URL). */
    val manualInput: String = "",
    val manualError: String? = null,
)

/** Kết quả bóc tách nội dung quét/nhập tay. */
private sealed interface ParsedCode {
    /** Mã QR/token: cần GPS trước khi gửi. */
    data class QrToken(val date: String, val token: String) : ParsedCode

    /** Mã dự phòng 6 số: gửi thẳng, server không kiểm khoảng cách. */
    data class Code6(val code: String) : ParsedCode

    data class Invalid(val message: String) : ParsedCode
}

class CheckinViewModel(
    private val api: CheckinApi,
    private val appContext: Context,
) : ViewModel() {

    private val _state = MutableStateFlow(CheckinUiState())
    val state: StateFlow<CheckinUiState> = _state

    /** Token QR đang chờ lấy GPS (chưa gửi server). */
    private var pendingDate: String? = null
    private var pendingToken: String? = null

    // ------------------------------------------------------------------
    // Điểm vào từ màn hình: nội dung quét được hoặc mã nhập tay
    // ------------------------------------------------------------------
    /** Nội dung thô từ máy quét QR. */
    fun onScanned(raw: String) = handleParsed(parseCode(raw), fromManual = false)

    fun setManualInput(text: String) =
        _state.update { it.copy(manualInput = text, manualError = null) }

    /** Bấm nút "Chấm công bằng mã": 6 số -> gửi thẳng; token/URL -> luồng GPS. */
    fun submitManual() {
        val text = _state.value.manualInput.trim()
        if (text.isBlank()) {
            _state.update { it.copy(manualError = "Nhập mã giúp em nhé: mã 6 số trên màn hình HR, hoặc dán token/liên kết QR.") }
            return
        }
        handleParsed(parseCode(text), fromManual = true)
    }

    private fun handleParsed(parsed: ParsedCode, fromManual: Boolean) {
        when (parsed) {
            is ParsedCode.Code6 -> submit(
                date = Format.today().toString(),
                token = parsed.code,
                lat = null,
                lon = null,
            )

            is ParsedCode.QrToken -> {
                pendingDate = parsed.date
                pendingToken = parsed.token
                // Màn hình quan sát cờ này để xin quyền vị trí rồi gọi proceedWithLocation().
                _state.update {
                    it.copy(
                        awaitingLocation = true,
                        phase = CheckinPhase.IDLE,
                        notice = null,
                        errorMessage = null,
                        manualError = null,
                    )
                }
            }

            is ParsedCode.Invalid -> {
                if (fromManual) {
                    _state.update { it.copy(manualError = parsed.message) }
                } else {
                    _state.update {
                        it.copy(phase = CheckinPhase.ERROR, errorMessage = parsed.message)
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Luồng GPS: màn hình gọi sau khi đã có quyền vị trí
    // ------------------------------------------------------------------
    /** Lấy vị trí hiện tại rồi gửi scan kèm toạ độ. Gọi thừa sẽ bị chặn bởi cờ. */
    fun proceedWithLocation() {
        val s = _state.value
        if (!s.awaitingLocation || s.phase == CheckinPhase.LOCATING ||
            s.phase == CheckinPhase.SUBMITTING
        ) {
            return
        }
        val date = pendingDate ?: return
        val token = pendingToken ?: return
        _state.update { it.copy(awaitingLocation = false, phase = CheckinPhase.LOCATING) }
        viewModelScope.launch {
            val location = runCatching { fetchCurrentLocation() }.getOrNull()
            if (location == null) {
                pendingDate = null
                pendingToken = null
                _state.update {
                    it.copy(
                        phase = CheckinPhase.IDLE,
                        notice = locationFailureHint(),
                    )
                }
                return@launch
            }
            submit(date, token, location.latitude, location.longitude)
        }
    }

    /** Người dùng từ chối quyền vị trí: huỷ luồng QR, gợi ý mã 6 số. */
    fun onLocationPermissionDenied() {
        pendingDate = null
        pendingToken = null
        _state.update {
            it.copy(
                awaitingLocation = false,
                phase = CheckinPhase.IDLE,
                notice = "Chưa có quyền vị trí nên chưa chấm công bằng mã QR được. " +
                    "Anh/chị có thể cấp quyền Định vị cho app trong Cài đặt, " +
                    "hoặc nhập mã dự phòng 6 số ở màn hình HR phía dưới.",
            )
        }
    }

    // ------------------------------------------------------------------
    // Gửi server
    // ------------------------------------------------------------------
    private fun submit(date: String, token: String, lat: Double?, lon: Double?) {
        if (_state.value.phase == CheckinPhase.SUBMITTING) return
        _state.update {
            it.copy(
                phase = CheckinPhase.SUBMITTING,
                awaitingLocation = false,
                result = null,
                infoMessage = null,
                errorMessage = null,
            )
        }
        viewModelScope.launch {
            runCatching { api.scan(ScanRequestBody(date = date, token = token, lat = lat, lon = lon)) }
                .onSuccess { resp ->
                    pendingDate = null
                    pendingToken = null
                    _state.update {
                        it.copy(phase = CheckinPhase.SUCCESS, result = resp.data)
                    }
                }
                .onFailure { e ->
                    pendingDate = null
                    pendingToken = null
                    val apiError = e.toApiException()
                    if (apiError.httpStatus == 409 || apiError.code == "ALREADY_CHECKED_IN") {
                        // Đã chấm công hôm nay: thông tin thân thiện, không phải lỗi.
                        _state.update {
                            it.copy(
                                phase = CheckinPhase.ALREADY,
                                infoMessage = apiError.message,
                            )
                        }
                    } else {
                        // INVALID_QR_CODE / OUT_OF_RANGE / OFFICE_NOT_CONFIGURED...:
                        // hiện nguyên message tiếng Việt của server (đã kèm khoảng cách thật).
                        _state.update {
                            it.copy(
                                phase = CheckinPhase.ERROR,
                                errorMessage = apiError.message,
                            )
                        }
                    }
                }
        }
    }

    /** Quay về trạng thái ban đầu để quét/nhập lượt mới. */
    fun reset() {
        pendingDate = null
        pendingToken = null
        _state.update {
            CheckinUiState(manualInput = it.manualInput)
        }
    }

    fun dismissNotice() = _state.update { it.copy(notice = null) }

    // ------------------------------------------------------------------
    // Bóc tách mã: URL ?d=..&t=.. | 12 ký tự hex | 6 chữ số
    // ------------------------------------------------------------------
    private fun parseCode(raw: String): ParsedCode {
        val text = raw.trim()
        // URL của mã QR trên màn HR: <origin>/checkin?d=YYYY-MM-DD&t=<token12>
        if (text.contains("?")) {
            val params = text.substringAfter("?")
                .split("&")
                .mapNotNull { part ->
                    val kv = part.split("=", limit = 2)
                    if (kv.size == 2) kv[0].trim() to kv[1].trim() else null
                }
                .toMap()
            val token = params["t"]?.lowercase().orEmpty()
            val date = params["d"]?.takeIf { DATE_REGEX.matches(it) }
                ?: Format.today().toString()
            return if (TOKEN_REGEX.matches(token)) {
                ParsedCode.QrToken(date = date, token = token)
            } else {
                ParsedCode.Invalid(
                    "Mã QR không đúng định dạng. Hãy quét mã đang hiển thị ở màn hình HR hôm nay, " +
                        "hoặc nhập mã dự phòng 6 số."
                )
            }
        }
        if (CODE6_REGEX.matches(text)) return ParsedCode.Code6(text)
        val token = text.lowercase()
        if (TOKEN_REGEX.matches(token)) {
            return ParsedCode.QrToken(date = Format.today().toString(), token = token)
        }
        return ParsedCode.Invalid(
            "Mã không đúng định dạng. Hãy quét mã QR tại văn phòng, hoặc nhập đúng mã dự phòng 6 số."
        )
    }

    // ------------------------------------------------------------------
    // GPS bằng LocationManager của framework (không dùng Play Services)
    // ------------------------------------------------------------------
    private fun locationFailureHint(): String {
        val lm = appContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        val anyProviderOn = lm != null && (
            runCatching { lm.isProviderEnabled(LocationManager.GPS_PROVIDER) }.getOrDefault(false) ||
                runCatching { lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) }.getOrDefault(false)
            )
        return if (!anyProviderOn) {
            "Định vị (GPS) trên máy đang tắt nên chưa lấy được vị trí. " +
                "Hãy bật Định vị rồi quét lại, hoặc nhập mã dự phòng 6 số ở phía dưới."
        } else {
            "Chưa lấy được vị trí sau ${LOCATION_TIMEOUT_MS / 1000} giây — có thể đang ở trong nhà, " +
                "sóng GPS yếu. Hãy ra gần cửa sổ/ngoài trời rồi quét lại, " +
                "hoặc nhập mã dự phòng 6 số ở phía dưới."
        }
    }

    /**
     * Vị trí hiện tại: ưu tiên lastKnown còn mới (<60s); nếu không có thì
     * requestSingleUpdate chờ tối đa [LOCATION_TIMEOUT_MS], quá hạn dùng
     * lastKnown (dù cũ) nếu tồn tại, cuối cùng mới trả null.
     * Có thể ném SecurityException nếu quyền bị thu hồi giữa chừng —
     * nơi gọi đã bọc runCatching.
     */
    private suspend fun fetchCurrentLocation(): Location? {
        val lm = appContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return null
        val gpsOn = runCatching { lm.isProviderEnabled(LocationManager.GPS_PROVIDER) }
            .getOrDefault(false)
        val netOn = runCatching { lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) }
            .getOrDefault(false)
        if (!gpsOn && !netOn) return null

        val lastKnown = listOfNotNull(
            if (gpsOn) runCatching { lm.getLastKnownLocation(LocationManager.GPS_PROVIDER) }.getOrNull() else null,
            if (netOn) runCatching { lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) }.getOrNull() else null,
        ).maxByOrNull { it.time }
        if (lastKnown != null &&
            System.currentTimeMillis() - lastKnown.time < LAST_KNOWN_FRESH_MS
        ) {
            return lastKnown
        }

        val provider = if (gpsOn) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
        val fresh = withTimeoutOrNull(LOCATION_TIMEOUT_MS) {
            suspendCancellableCoroutine<Location?> { cont ->
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        if (cont.isActive) cont.resume(location)
                    }

                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

                    override fun onProviderEnabled(provider: String) = Unit

                    override fun onProviderDisabled(provider: String) = Unit
                }
                try {
                    lm.requestSingleUpdate(provider, listener, Looper.getMainLooper())
                } catch (e: Exception) {
                    if (cont.isActive) cont.resume(null)
                }
                cont.invokeOnCancellation { runCatching { lm.removeUpdates(listener) } }
            }
        }
        return fresh ?: lastKnown
    }

    class Factory(
        private val api: CheckinApi,
        private val appContext: Context,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            CheckinViewModel(api, appContext) as T
    }

    companion object {
        private val TOKEN_REGEX = Regex("^[0-9a-f]{12}$")
        private val CODE6_REGEX = Regex("^\\d{6}$")
        private val DATE_REGEX = Regex("^\\d{4}-\\d{2}-\\d{2}$")
        private const val LOCATION_TIMEOUT_MS = 10_000L
        private const val LAST_KNOWN_FRESH_MS = 60_000L
    }
}
