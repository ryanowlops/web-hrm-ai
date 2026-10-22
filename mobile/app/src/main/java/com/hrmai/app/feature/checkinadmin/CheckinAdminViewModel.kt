package com.hrmai.app.feature.checkinadmin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.BuildConfig
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale

data class CheckinAdminUiState(
    /** Đã nhận được phiên đăng nhập từ SessionStore hay chưa. */
    val sessionReady: Boolean = false,
    val role: String? = null,
    /** Chỉ hr/admin mới xem được màn này (khớp require_roles ở server). */
    val isAuthorized: Boolean = false,
    // Mã QR hôm nay
    val qr: TodayQrDto? = null,
    /** URL đầy đủ nhúng trong ảnh QR: <origin>/checkin?d=<date>&t=<token>. */
    val qrContent: String? = null,
    val qrLoading: Boolean = false,
    val qrError: String? = null,
    /** Giây còn lại tới lúc mã xoay (đếm ngược từng giây trong ViewModel). */
    val secondsLeft: Int = 0,
    // Cấu hình văn phòng
    val config: OfficeConfigDto? = null,
    val configLoading: Boolean = false,
    val configError: String? = null,
    val latText: String = "",
    val lonText: String = "",
    val radiusText: String = "",
    val configFormError: String? = null,
    val savingConfig: Boolean = false,
    val locating: Boolean = false,
    // Nhật ký hôm nay
    val logs: List<CheckinLogDto> = emptyList(),
    val logsDate: String? = null,
    val logsLoading: Boolean = false,
    val logsError: String? = null,
    val logsRefreshing: Boolean = false,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
)

class CheckinAdminViewModel(
    private val api: CheckinAdminApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(CheckinAdminUiState())
    val state: StateFlow<CheckinAdminUiState> = _state

    private var baseUrl: String = BuildConfig.DEFAULT_BASE_URL
    private var bootstrapped = false
    private var countdownJob: Job? = null

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                if (session == null) return@collect
                baseUrl = session.baseUrl
                val role = session.user.role
                val authorized = role in HR_ROLES
                _state.update {
                    it.copy(
                        sessionReady = true,
                        role = role,
                        isAuthorized = authorized,
                        // baseUrl có thể đổi (màn đăng nhập) -> dựng lại nội dung QR.
                        qrContent = it.qr?.let { qr -> buildQrContent(qr) },
                    )
                }
                if (authorized && !bootstrapped) {
                    bootstrapped = true
                    loadQr()
                    loadConfig()
                    loadLogs()
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Mã QR + đếm ngược
    // ------------------------------------------------------------------
    fun loadQr() {
        if (_state.value.qrLoading) return
        viewModelScope.launch {
            _state.update { it.copy(qrLoading = true, qrError = null) }
            runCatching { api.getTodayQr() }
                .onSuccess { resp ->
                    val qr = resp.data
                    _state.update {
                        it.copy(
                            qr = qr,
                            qrContent = qr?.let { q -> buildQrContent(q) },
                            qrLoading = false,
                            qrError = if (qr == null) "Server không trả về mã QR." else null,
                        )
                    }
                    if (qr != null) scheduleNextRefresh(qr.expiresInS ?: 0)
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            qrLoading = false,
                            qrError = if (it.qr == null) e.toApiException().message else it.qrError,
                        )
                    }
                    // Đã có mã cũ thì giữ hiển thị và thử tải lại sau 30 giây.
                    if (_state.value.qr != null) scheduleNextRefresh(RETRY_AFTER_FAIL_S)
                }
        }
    }

    /** Đếm ngược từng giây; chạm 0 thì tự tải lại mã của ngày mới. */
    private fun scheduleNextRefresh(seconds: Int) {
        countdownJob?.cancel()
        _state.update { it.copy(secondsLeft = seconds.coerceAtLeast(0)) }
        if (seconds <= 0) return
        countdownJob = viewModelScope.launch {
            while (_state.value.secondsLeft > 0) {
                delay(1_000)
                _state.update { it.copy(secondsLeft = (it.secondsLeft - 1).coerceAtLeast(0)) }
            }
            loadQr()
        }
    }

    /** origin = baseUrl bỏ hậu tố api/v1/ (vd https://hrm-ai-api.onrender.com). */
    private fun buildQrContent(qr: TodayQrDto): String {
        val origin = baseUrl.trimEnd('/').removeSuffix("api/v1").trimEnd('/')
        return "$origin/checkin?d=${qr.date.orEmpty()}&t=${qr.token.orEmpty()}"
    }

    // ------------------------------------------------------------------
    // Cấu hình văn phòng
    // ------------------------------------------------------------------
    fun loadConfig() {
        viewModelScope.launch {
            _state.update { it.copy(configLoading = true, configError = null) }
            runCatching { api.getConfig() }
                .onSuccess { resp ->
                    val cfg = resp.data
                    _state.update {
                        it.copy(
                            config = cfg,
                            configLoading = false,
                            configError = if (cfg == null) "Server không trả về cấu hình." else null,
                            latText = cfg?.lat?.toString() ?: it.latText,
                            lonText = cfg?.lon?.toString() ?: it.lonText,
                            radiusText = cfg?.radiusM?.toString() ?: it.radiusText,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            configLoading = false,
                            configError = if (it.config == null) {
                                e.toApiException().message
                            } else {
                                it.configError
                            },
                        )
                    }
                }
        }
    }

    fun setLatText(text: String) =
        _state.update { it.copy(latText = text, configFormError = null) }

    fun setLonText(text: String) =
        _state.update { it.copy(lonText = text, configFormError = null) }

    fun setRadiusText(text: String) =
        _state.update { it.copy(radiusText = text, configFormError = null) }

    fun setLocating(value: Boolean) = _state.update { it.copy(locating = value) }

    /** Màn hình đã lấy được vị trí hiện tại của máy -> điền vào form. */
    fun onLocationPicked(lat: Double, lon: Double) {
        _state.update {
            it.copy(
                locating = false,
                latText = formatCoord(lat),
                lonText = formatCoord(lon),
                configFormError = null,
                message = "Đã lấy vị trí hiện tại. Kiểm tra lại rồi bấm Lưu cấu hình nhé.",
            )
        }
    }

    fun onLocationFailed(message: String) {
        _state.update { it.copy(locating = false, message = message) }
    }

    fun saveConfig() {
        val s = _state.value
        if (s.savingConfig) return
        val lat = s.latText.trim().toDoubleOrNull()
        val lon = s.lonText.trim().toDoubleOrNull()
        val radiusText = s.radiusText.trim()
        val radius = if (radiusText.isBlank()) null else radiusText.toIntOrNull()
        val error = when {
            lat == null -> "Nhập vĩ độ (lat) dạng số, vd 21.0285."
            lat !in -90.0..90.0 -> "Vĩ độ phải trong khoảng -90 đến 90."
            lon == null -> "Nhập kinh độ (lon) dạng số, vd 105.8542."
            lon !in -180.0..180.0 -> "Kinh độ phải trong khoảng -180 đến 180."
            radiusText.isNotBlank() && radius == null -> "Bán kính phải là số nguyên (mét)."
            radius != null && radius !in 10..2000 -> "Bán kính phải từ 10 đến 2000 mét."
            else -> null
        }
        if (error != null) {
            _state.update { it.copy(configFormError = error) }
            return
        }
        _state.update { it.copy(savingConfig = true, configFormError = null) }
        viewModelScope.launch {
            runCatching {
                api.updateConfig(UpdateOfficeConfigBody(lat = lat!!, lon = lon!!, radiusM = radius))
            }.onSuccess { resp ->
                val cfg = resp.data
                _state.update {
                    it.copy(
                        savingConfig = false,
                        config = cfg ?: it.config,
                        latText = cfg?.lat?.toString() ?: it.latText,
                        lonText = cfg?.lon?.toString() ?: it.lonText,
                        radiusText = cfg?.radiusM?.toString() ?: it.radiusText,
                        message = "Đã lưu cấu hình văn phòng.",
                    )
                }
                loadLogs()
            }.onFailure { e ->
                _state.update {
                    it.copy(savingConfig = false, configFormError = e.toApiException().message)
                }
            }
        }
    }

    private fun formatCoord(value: Double): String =
        String.format(Locale.US, "%.6f", value).trimEnd('0').trimEnd('.')

    // ------------------------------------------------------------------
    // Nhật ký hôm nay
    // ------------------------------------------------------------------
    fun loadLogs() {
        viewModelScope.launch {
            _state.update { it.copy(logsLoading = true, logsError = null) }
            fetchLogs()
        }
    }

    private suspend fun fetchLogs() {
        runCatching { api.getLogs(null) }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        logs = resp.data ?: emptyList(),
                        logsDate = resp.date ?: it.logsDate,
                        logsLoading = false,
                        logsError = null,
                    )
                }
            }
            .onFailure { e ->
                _state.update {
                    it.copy(logsLoading = false, logsError = e.toApiException().message)
                }
            }
    }

    /** Kéo để làm mới: nhật ký + mã QR (không đụng form cấu hình đang sửa). */
    fun refresh() {
        if (_state.value.logsRefreshing) return
        viewModelScope.launch {
            _state.update { it.copy(logsRefreshing = true) }
            fetchLogs()
            _state.update { it.copy(logsRefreshing = false) }
        }
        loadQr()
    }

    // ------------------------------------------------------------------
    fun notify(text: String) = _state.update { it.copy(message = text) }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: CheckinAdminApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            CheckinAdminViewModel(api, sessionStore) as T
    }

    companion object {
        private val HR_ROLES = setOf("hr", "admin")
        private const val RETRY_AFTER_FAIL_S = 30
    }
}
