package com.hrmai.app.feature.checkinadmin

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format

@Composable
fun CheckinAdminRoute(container: AppContainer) {
    val vm: CheckinAdminViewModel = viewModel(
        factory = CheckinAdminViewModel.Factory(
            container.api(CheckinAdminApi::class.java),
            container.sessionStore,
        ),
    )
    CheckinAdminScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CheckinAdminScreen(vm: CheckinAdminViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    // ---- Xin quyền + lấy vị trí hiện tại cho nút "Dùng vị trí của tôi" ----
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            vm.setLocating(true)
            fetchCurrentLocation(context, vm::onLocationPicked, vm::onLocationFailed)
        } else {
            vm.notify(
                "Chưa được cấp quyền vị trí nên chưa lấy được toạ độ. " +
                    "Có thể nhập tay toạ độ lấy từ Google Maps nhé.",
            )
        }
    }
    val onUseMyLocation: () -> Unit = {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            vm.setLocating(true)
            fetchCurrentLocation(context, vm::onLocationPicked, vm::onLocationFailed)
        } else {
            permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        when {
            !state.sessionReady -> LoadingState(modifier = Modifier.fillMaxSize())

            !state.isAuthorized -> Column(
                modifier = Modifier.fillMaxSize().padding(24.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                EmptyState(
                    "Màn hình mã QR chấm công chỉ dành cho bộ phận Nhân sự và Quản trị viên. " +
                        "Tài khoản của bạn không có quyền xem trang này.",
                )
            }

            else -> PullToRefreshBox(
                isRefreshing = state.logsRefreshing,
                onRefresh = vm::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    item { QrCard(state, vm) }
                    item { ConfigCard(state, vm, onUseMyLocation) }
                    item {
                        Column {
                            SectionHeader("Nhật ký chấm công hôm nay")
                            if (state.logsDate != null) {
                                Text(
                                    text = "Ngày ${Format.date(state.logsDate)} (giờ Việt Nam)",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = InkMuted,
                                )
                            }
                        }
                    }
                    when {
                        state.logsLoading && state.logs.isEmpty() -> item { LoadingState() }
                        state.logsError != null && state.logs.isEmpty() -> item {
                            ErrorState(state.logsError!!, onRetry = vm::loadLogs)
                        }
                        state.logs.isEmpty() -> item {
                            EmptyState("Hôm nay chưa có lượt quét QR / nhập mã nào.")
                        }
                        else -> items(state.logs, key = { it.id ?: it.hashCode() }) { log ->
                            LogRow(log)
                        }
                    }
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }
}

// ----------------------------------------------------------------------
// Thẻ mã QR
// ----------------------------------------------------------------------
@Composable
private fun QrCard(state: CheckinAdminUiState, vm: CheckinAdminViewModel) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Mã QR chấm công hôm nay",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            val qr = state.qr
            when {
                qr == null && state.qrError != null -> ErrorState(
                    state.qrError!!,
                    onRetry = vm::loadQr,
                )
                qr == null -> LoadingState()
                else -> {
                    Text(
                        text = "Ngày ${Format.date(qr.date)} (giờ Việt Nam)",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                    Spacer(Modifier.height(12.dp))
                    val bitmap = remember(state.qrContent) {
                        state.qrContent?.let { generateQrBitmap(it) }
                    }
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = "Mã QR chấm công hôm nay",
                            modifier = Modifier
                                .size(252.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .border(1.dp, BorderGray, RoundedCornerShape(12.dp))
                                .background(Color.White)
                                .padding(8.dp),
                        )
                    } else {
                        EmptyState("Chưa dựng được ảnh QR, chạm để thử lại.")
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = state.qrContent.orEmpty(),
                        style = MaterialTheme.typography.labelSmall,
                        color = InkMuted,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "MÃ DỰ PHÒNG 6 SỐ (CHO MÁY KHÔNG CÓ GPS)",
                        style = MaterialTheme.typography.labelSmall,
                        color = InkMuted,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = qr.code6.orEmpty(),
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 10.sp,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(10.dp))
                    StatusChip(
                        text = "Mã tự đổi sau ${formatCountdown(state.secondsLeft)}",
                        bg = BrandBlueSoft,
                        fg = BrandBlueDark,
                    )
                    if (state.config?.configured == false) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "Chưa cài toạ độ văn phòng: nhân viên quét QR + GPS " +
                                "sẽ chưa chấm công được. Cài toạ độ ở thẻ ngay bên dưới nhé.",
                            style = MaterialTheme.typography.bodySmall,
                            color = WarningAmber,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Thẻ cấu hình văn phòng
// ----------------------------------------------------------------------
@Composable
private fun ConfigCard(
    state: CheckinAdminUiState,
    vm: CheckinAdminViewModel,
    onUseMyLocation: () -> Unit,
) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
            SectionHeader("Cấu hình văn phòng")
            Spacer(Modifier.height(8.dp))
            when {
                state.configLoading && state.config == null -> LoadingState()
                state.config == null && state.configError != null -> ErrorState(
                    state.configError!!,
                    onRetry = vm::loadConfig,
                )
                else -> {
                    val configured = state.config?.configured == true
                    StatusChip(
                        text = if (configured) "Đã cấu hình" else "Chưa cấu hình",
                        bg = if (configured) Color(0xFFECFDF3) else Color(0xFFFFFAEB),
                        fg = if (configured) SuccessGreen else WarningAmber,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Toạ độ dùng để đối chiếu GPS của nhân viên khi quét mã. " +
                            "Lấy từ Google Maps, hoặc dùng vị trí hiện tại của máy này " +
                            "nếu đang ở văn phòng.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = state.latText,
                        onValueChange = vm::setLatText,
                        label = { Text("Vĩ độ (lat)") },
                        placeholder = { Text("21.0285") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = state.lonText,
                        onValueChange = vm::setLonText,
                        label = { Text("Kinh độ (lon)") },
                        placeholder = { Text("105.8542") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = state.radiusText,
                        onValueChange = vm::setRadiusText,
                        label = { Text("Bán kính cho phép (mét, 10–2000)") },
                        placeholder = { Text("150") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (state.configFormError != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = state.configFormError,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = onUseMyLocation,
                        enabled = !state.locating,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (state.locating) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp))
                            Spacer(Modifier.size(8.dp))
                        }
                        Text("Dùng vị trí hiện tại của tôi")
                    }
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = vm::saveConfig,
                        enabled = !state.savingConfig,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (state.savingConfig) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = Color.White,
                            )
                            Spacer(Modifier.size(8.dp))
                        }
                        Text(if (state.savingConfig) "Đang lưu..." else "Lưu cấu hình")
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------------
// Một dòng nhật ký
// ----------------------------------------------------------------------
@Composable
private fun LogRow(log: CheckinLogDto) {
    HrmCard(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            InitialAvatar(log.employeeName, sizeDp = 40)
            Spacer(Modifier.size(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = log.employeeName ?: "Nhân viên #${log.employeeId ?: "?"}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (!log.employeeCode.isNullOrBlank()) {
                        Spacer(Modifier.size(6.dp))
                        Text(
                            text = log.employeeCode,
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                Text(
                    text = "${methodLabel(log.method)} • ${Format.time(log.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                if (log.distanceM != null) {
                    Text(
                        text = "Cách văn phòng ${log.distanceM}m",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                if (!log.reason.isNullOrBlank()) {
                    Text(
                        text = log.reason,
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
            }
            Spacer(Modifier.size(8.dp))
            when (log.result) {
                "ok" -> StatusChip("Thành công", Color(0xFFECFDF3), SuccessGreen)
                "rejected" -> StatusChip("Bị từ chối", Color(0xFFFEF3F2), DangerRed)
                else -> StatusChip(log.result ?: "—", BrandBlueSoft, BrandBlueDark)
            }
        }
    }
}

private fun methodLabel(method: String?): String = when (method) {
    "qr_gps" -> "QR + GPS"
    "qr_code" -> "Mã 6 số"
    else -> method ?: "—"
}

private fun formatCountdown(totalSeconds: Int): String {
    val s = totalSeconds.coerceAtLeast(0)
    return "%02d:%02d:%02d".format(s / 3600, (s % 3600) / 60, s % 60)
}

// ----------------------------------------------------------------------
// Sinh ảnh QR bằng ZXing (BitMatrix -> Bitmap đen/trắng)
// ----------------------------------------------------------------------
private fun generateQrBitmap(content: String, sizePx: Int = 768): Bitmap? = runCatching {
    val hints = mapOf(
        EncodeHintType.MARGIN to 2,
        EncodeHintType.CHARACTER_SET to "UTF-8",
    )
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
    val pixels = IntArray(sizePx * sizePx)
    for (y in 0 until sizePx) {
        val offset = y * sizePx
        for (x in 0 until sizePx) {
            pixels[offset + x] =
                if (matrix.get(x, y)) android.graphics.Color.BLACK else android.graphics.Color.WHITE
        }
    }
    Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565).apply {
        setPixels(pixels, 0, sizePx, 0, 0, sizePx, sizePx)
    }
}.getOrNull()

// ----------------------------------------------------------------------
// Lấy vị trí hiện tại bằng LocationManager (không dùng Play Services)
// ----------------------------------------------------------------------
private fun fetchCurrentLocation(
    context: Context,
    onResult: (lat: Double, lon: Double) -> Unit,
    onError: (String) -> Unit,
) {
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    if (lm == null) {
        onError("Thiết bị không hỗ trợ định vị.")
        return
    }
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val provider = listOf(
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
            ).firstOrNull { name ->
                runCatching { lm.isProviderEnabled(name) }.getOrDefault(false)
            }
            if (provider == null) {
                onError("Hãy bật định vị (GPS) trên máy rồi thử lại nhé.")
                return
            }
            lm.getCurrentLocation(provider, null, context.mainExecutor) { location: Location? ->
                if (location != null) {
                    onResult(location.latitude, location.longitude)
                } else {
                    onError("Chưa lấy được vị trí, chờ ít giây rồi thử lại nhé.")
                }
            }
        } else {
            fetchLegacyLocation(lm, onResult, onError)
        }
    } catch (e: SecurityException) {
        onError("Chưa được cấp quyền vị trí nên chưa lấy được toạ độ.")
    } catch (e: Exception) {
        onError("Không lấy được vị trí hiện tại, thử lại nhé.")
    }
}

/**
 * Đường lấy vị trí cho Android < 30 (chưa có getCurrentLocation): xin fix từ
 * GPS và đồng thời từ mạng — GPS trong nhà thường không có fix, vị trí mạng
 * là đường dự phòng. Fix đầu tiên tới sẽ thắng.
 */
@Suppress("DEPRECATION")
private fun fetchLegacyLocation(
    lm: LocationManager,
    onResult: (lat: Double, lon: Double) -> Unit,
    onError: (String) -> Unit,
) {
    val gpsEnabled = runCatching {
        lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
    }.getOrDefault(false)
    val networkEnabled = runCatching {
        lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }.getOrDefault(false)
    if (!gpsEnabled && !networkEnabled) {
        onError("Hãy bật định vị (GPS) trên máy rồi thử lại nhé.")
        return
    }
    var delivered = false
    val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            if (delivered) return
            delivered = true
            runCatching { lm.removeUpdates(this) }
            onResult(location.latitude, location.longitude)
        }

        override fun onProviderDisabled(provider: String) {
            if (!delivered && provider == LocationManager.GPS_PROVIDER && !networkEnabled) {
                onError("Hãy bật định vị (GPS) trên máy rồi thử lại nhé.")
            }
        }
    }
    try {
        if (gpsEnabled) {
            lm.requestSingleUpdate(LocationManager.GPS_PROVIDER, listener, Looper.getMainLooper())
        }
        if (networkEnabled) {
            lm.requestSingleUpdate(
                LocationManager.NETWORK_PROVIDER,
                listener,
                Looper.getMainLooper(),
            )
        }
    } catch (e: SecurityException) {
        onError("Chưa được cấp quyền vị trí nên chưa lấy được toạ độ.")
    } catch (e: Exception) {
        onError("Không lấy được vị trí hiện tại, thử lại nhé.")
    }
}
