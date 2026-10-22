package com.hrmai.app.feature.checkin

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Dialpad
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

@Composable
fun CheckinScanRoute(container: AppContainer) {
    val vm: CheckinViewModel = viewModel(
        factory = CheckinViewModel.Factory(
            container.api(CheckinApi::class.java),
            container.appContext,
        ),
    )
    CheckinScreen(vm)
}

@Composable
private fun CheckinScreen(vm: CheckinViewModel) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    var cameraDenied by remember { mutableStateOf(false) }
    val busy = state.phase == CheckinPhase.LOCATING || state.phase == CheckinPhase.SUBMITTING

    // --- Máy quét QR (zxing) ---
    val scanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        val contents = result.contents
        if (!contents.isNullOrBlank()) vm.onScanned(contents)
        // contents == null: người dùng tự thoát máy quét, không làm gì thêm.
    }
    fun launchScanner() {
        val options = ScanOptions().apply {
            setPrompt("Hướng camera vào mã QR chấm công ở văn phòng")
            setBeepEnabled(false)
            setOrientationLocked(true)
            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
        }
        scanLauncher.launch(options)
    }

    // --- Quyền camera ---
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            cameraDenied = false
            launchScanner()
        } else {
            cameraDenied = true
        }
    }
    fun onScanClick() {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            cameraDenied = false
            launchScanner()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    // --- Quyền vị trí: ViewModel bật awaitingLocation khi đã có token QR ---
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { it }) {
            vm.proceedWithLocation()
        } else {
            vm.onLocationPermissionDenied()
        }
    }
    LaunchedEffect(state.awaitingLocation) {
        if (!state.awaitingLocation) return@LaunchedEffect
        val hasLocation = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        if (hasLocation) {
            vm.proceedWithLocation()
        } else {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(CanvasGray)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(
            text = "Chấm công QR + GPS",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Quét mã QR đang hiển thị tại văn phòng, app sẽ đối chiếu vị trí GPS " +
                "của anh/chị với toạ độ văn phòng trước khi ghi nhận chấm công.",
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
        )
        Spacer(Modifier.height(16.dp))

        // --- Khu vực quét / tiến trình ---
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Filled.QrCodeScanner,
                    contentDescription = null,
                    tint = BrandBlue,
                    modifier = Modifier.size(44.dp),
                )
                Spacer(Modifier.height(10.dp))
                when (state.phase) {
                    CheckinPhase.LOCATING -> BusyRow("Đang lấy vị trí GPS của anh/chị…")
                    CheckinPhase.SUBMITTING -> BusyRow("Đang gửi chấm công lên hệ thống…")
                    else -> {
                        Button(
                            onClick = { onScanClick() },
                            enabled = !busy,
                            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.QrCodeScanner,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.size(8.dp))
                            Text("Quét mã QR")
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Mã QR đổi mới mỗi ngày và chỉ dùng trong ngày hôm nay.",
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                if (cameraDenied) {
                    Spacer(Modifier.height(10.dp))
                    NoticeBox(
                        text = "Chưa có quyền camera nên chưa quét được mã QR. " +
                            "Anh/chị cấp quyền Camera cho app trong Cài đặt, " +
                            "hoặc nhập mã dự phòng 6 số ở mục dưới.",
                    )
                }
            }
        }

        // --- Lưu ý từ luồng GPS (từ chối quyền / GPS tắt / timeout) ---
        state.notice?.let { notice ->
            Spacer(Modifier.height(12.dp))
            HrmCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(
                        imageVector = Icons.Filled.LocationOn,
                        contentDescription = null,
                        tint = WarningAmber,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.size(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = notice,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        TextButton(onClick = { vm.dismissNotice() }) { Text("Đã hiểu") }
                    }
                }
            }
        }

        // --- Thẻ kết quả ---
        when (state.phase) {
            CheckinPhase.SUCCESS -> {
                Spacer(Modifier.height(12.dp))
                SuccessCard(result = state.result, onDone = { vm.reset() })
            }

            CheckinPhase.ALREADY -> {
                Spacer(Modifier.height(12.dp))
                HrmCard(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Filled.Info,
                                contentDescription = null,
                                tint = BrandBlue,
                                modifier = Modifier.size(22.dp),
                            )
                            Spacer(Modifier.size(8.dp))
                            Text(
                                text = "Hôm nay đã chấm công rồi",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = state.infoMessage ?: "Bạn đã check-in hôm nay rồi.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = InkMuted,
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = { vm.reset() },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Đã hiểu") }
                    }
                }
            }

            CheckinPhase.ERROR -> {
                Spacer(Modifier.height(12.dp))
                HrmCard(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        Text(
                            text = "Chưa chấm công được",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = DangerRed,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = state.errorMessage ?: "Đã có lỗi xảy ra, thử lại nhé.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(
                            onClick = { vm.reset() },
                            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Thử lại") }
                    }
                }
            }

            else -> Unit
        }

        Spacer(Modifier.height(20.dp))

        // --- Nhập mã thủ công ---
        SectionHeader(title = "Nhập mã thủ công")
        Spacer(Modifier.height(8.dp))
        HrmCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                Text(
                    text = "Máy không quét được hoặc không có GPS? Nhập mã dự phòng 6 số " +
                        "đang hiển thị dưới mã QR ở màn hình HR — mã số không cần GPS. " +
                        "Cũng có thể dán token 12 ký tự hoặc cả liên kết QR vào đây " +
                        "(trường hợp này vẫn kiểm tra GPS).",
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.manualInput,
                    onValueChange = { vm.setManualInput(it) },
                    label = { Text("Mã chấm công") },
                    placeholder = { Text("VD: 123456") },
                    singleLine = true,
                    isError = state.manualError != null,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                )
                state.manualError?.let { err ->
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodySmall,
                        color = DangerRed,
                    )
                }
                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = { vm.submitManual() },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Dialpad,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.size(8.dp))
                    Text("Chấm công bằng mã")
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun BusyRow(text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
        modifier = Modifier.fillMaxWidth(),
    ) {
        CircularProgressIndicator(color = BrandBlue, modifier = Modifier.size(20.dp))
        Spacer(Modifier.size(10.dp))
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = InkMuted)
    }
}

@Composable
private fun NoticeBox(text: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFFFFAEB))
            .padding(12.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = WarningAmber,
        )
    }
}

@Composable
private fun SuccessCard(result: ScanResultDto?, onDone: () -> Unit) {
    val attendance = result?.attendance
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = SuccessGreen,
                    modifier = Modifier.size(24.dp),
                )
                Spacer(Modifier.size(8.dp))
                Text(
                    text = "Chấm công thành công",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.weight(1f))
                attendance?.status?.let { status ->
                    when (status) {
                        "present" -> StatusChip("Đúng giờ", Color(0xFFECFDF3), SuccessGreen)
                        "late" -> StatusChip("Đi muộn", Color(0xFFFFFAEB), WarningAmber)
                        else -> StatusChip(status, BrandBlueSoft, BrandBlue)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            result?.message?.let { msg ->
                Text(text = msg, style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(4.dp))
            }
            attendance?.checkInAt?.let { at ->
                InfoLine("Giờ vào", "${Format.time(at)} · ${Format.date(at)}")
            }
            result?.distanceM?.let { distance ->
                InfoLine("Cách văn phòng", "${distance}m")
            }
            InfoLine(
                "Phương thức",
                when (result?.method) {
                    "qr_gps" -> "Quét QR + GPS"
                    "qr_code" -> "Mã dự phòng 6 số"
                    else -> "—"
                },
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onDone,
                colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Xong") }
        }
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = InkMuted)
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}
