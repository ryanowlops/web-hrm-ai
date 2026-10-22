package com.hrmai.app.feature.jd

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.WarningAmber
import kotlinx.coroutines.launch

@Composable
fun JdGeneratorRoute(container: AppContainer) {
    val vm: JdViewModel = viewModel(
        factory = JdViewModel.Factory(
            container.api(JdApi::class.java),
            container.sessionStore,
        ),
    )
    JdGeneratorScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun JdGeneratorScreen(vm: JdViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val clipboardManager = LocalClipboardManager.current
    val scrollState = rememberScrollState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    // Có kết quả mới -> tự cuộn xuống phần kết quả cho HR xem ngay.
    LaunchedEffect(state.result) {
        if (state.result != null) {
            scrollState.animateScrollTo(scrollState.maxValue)
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        when {
            !state.roleLoaded -> LoadingState(modifier = Modifier.fillMaxSize())

            !state.canUse -> EmptyState(
                message = "Tính năng tạo JD bằng AI chỉ dành cho bộ phận Nhân sự (HR) " +
                    "và Admin. Anh/chị liên hệ phòng nhân sự khi cần soạn mô tả " +
                    "công việc nhé.",
                modifier = Modifier.fillMaxSize(),
            )

            else -> Column(
                modifier = Modifier
                    .fillMaxSize()
                    .imePadding()
                    .verticalScroll(scrollState)
                    .padding(16.dp),
            ) {
                Text(
                    text = "Nhập chức danh, cấp bậc và kỹ năng chính — AI sẽ soạn bản " +
                        "mô tả công việc đầy đủ để xem trước và sao chép. Đây là công " +
                        "cụ soạn thảo: JD không tự đăng thành tin tuyển dụng.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
                Spacer(Modifier.height(16.dp))

                JdFormCard(state = state, vm = vm)

                state.result?.let { result ->
                    Spacer(Modifier.height(20.dp))
                    JdResultSection(
                        result = result,
                        onCopy = {
                            clipboardManager.setText(AnnotatedString(result.toPlainText()))
                            vm.notifyCopied()
                        },
                        onNewJd = {
                            vm.clearResult()
                            scope.launch { scrollState.animateScrollTo(0) }
                        },
                    )
                }
                Spacer(Modifier.height(24.dp))
            }
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun JdFormCard(state: JdUiState, vm: JdViewModel) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
            SectionHeader(title = "Thông tin vị trí")
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.title,
                onValueChange = { vm.setTitle(it) },
                label = { Text("Chức danh *") },
                placeholder = { Text("Ví dụ: Kỹ sư Backend") },
                singleLine = true,
                enabled = !state.generating,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.departmentName,
                onValueChange = { vm.setDepartmentName(it) },
                label = { Text("Phòng ban") },
                placeholder = { Text("Ví dụ: Phòng Kỹ thuật") },
                supportingText = { Text("Không bắt buộc") },
                singleLine = true,
                enabled = !state.generating,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))

            Text(
                text = "Cấp bậc",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(8.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                JD_LEVELS.forEach { level ->
                    FilterChip(
                        selected = state.level == level.value,
                        onClick = { vm.setLevel(level.value) },
                        label = { Text(level.label) },
                        enabled = !state.generating,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.skillsText,
                onValueChange = { vm.setSkillsText(it) },
                label = { Text("Kỹ năng chính") },
                placeholder = { Text("Ví dụ: Python, Flask, PostgreSQL") },
                supportingText = { Text("Các kỹ năng cách nhau bằng dấu phẩy") },
                enabled = !state.generating,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = state.salaryNote,
                onValueChange = { vm.setSalaryNote(it) },
                label = { Text("Ghi chú lương") },
                placeholder = { Text("Ví dụ: 20–30 triệu/tháng") },
                supportingText = {
                    Text("Không bắt buộc — để trống thì JD ghi \"thoả thuận theo năng lực\"")
                },
                singleLine = true,
                enabled = !state.generating,
                modifier = Modifier.fillMaxWidth(),
            )

            if (state.formError != null) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = state.formError,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = { vm.generate() },
                enabled = !state.generating,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.generating) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.size(10.dp))
                    Text("Đang tạo JD…")
                } else {
                    Text("Tạo JD bằng AI")
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "AI trên bản miễn phí có thể mất khoảng 10–30 giây, anh/chị đợi chút nhé.",
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

@Composable
private fun JdResultSection(
    result: JdResultDto,
    onCopy: () -> Unit,
    onNewJd: () -> Unit,
) {
    val isAi = result.source == "ai"
    Column(modifier = Modifier.fillMaxWidth()) {
        SectionHeader(title = "JD: ${result.title ?: ""} · ${jdLevelLabel(result.level)}")
        Spacer(Modifier.height(8.dp))
        StatusChip(
            text = if (isAi) "Viết bởi AI" else "Bản mẫu tự động",
            bg = if (isAi) BrandBlueSoft else Color(0xFFFFFAEB),
            fg = if (isAi) BrandBlueDark else WarningAmber,
        )
        Spacer(Modifier.height(12.dp))

        if (!result.summary.isNullOrBlank()) {
            JdTextBlock(title = "Tóm tắt", body = result.summary)
        }
        JdBulletBlock(title = "Trách nhiệm", items = result.responsibilities)
        JdBulletBlock(title = "Yêu cầu", items = result.requirements)
        JdBulletBlock(title = "Quyền lợi", items = result.benefits)

        Spacer(Modifier.height(4.dp))
        Button(onClick = onCopy, modifier = Modifier.fillMaxWidth()) {
            Text("Sao chép toàn bộ JD")
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onNewJd, modifier = Modifier.fillMaxWidth()) {
            Text("Tạo bản khác")
        }
        Text(
            text = "Sau khi sao chép, HR dán vào form tạo tin tuyển dụng và chỉnh " +
                "sửa lại trước khi đăng.",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun JdTextBlock(title: String, body: String) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
            SectionHeader(title = title)
            Spacer(Modifier.height(8.dp))
            Text(text = body, style = MaterialTheme.typography.bodyMedium)
        }
    }
    Spacer(Modifier.height(12.dp))
}

@Composable
private fun JdBulletBlock(title: String, items: List<String>?) {
    val cleaned = (items ?: emptyList()).map { it.trim() }.filter { it.isNotEmpty() }
    if (cleaned.isEmpty()) return
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth()) {
            SectionHeader(title = title)
            Spacer(Modifier.height(8.dp))
            cleaned.forEach { item ->
                Row(modifier = Modifier.padding(vertical = 3.dp)) {
                    Text(
                        text = "•",
                        style = MaterialTheme.typography.bodyMedium,
                        color = BrandBlue,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(end = 8.dp),
                    )
                    Text(text = item, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
    Spacer(Modifier.height(12.dp))
}
