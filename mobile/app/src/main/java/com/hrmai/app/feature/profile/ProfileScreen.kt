package com.hrmai.app.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.util.Format

@Composable
fun ProfileRoute(container: AppContainer) {
    val vm: ProfileViewModel = viewModel(
        factory = ProfileViewModel.Factory(
            api = container.api(ProfileApi::class.java),
            sessionStore = container.sessionStore,
        ),
    )
    val state by vm.state.collectAsState()
    ProfileScreen(
        state = state,
        onRetry = vm::retry,
        onLogout = vm::logout,
    )
}

@Composable
private fun ProfileScreen(
    state: ProfileUiState,
    onRetry: () -> Unit,
    onLogout: () -> Unit,
) {
    var showLogoutDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(CanvasGray)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        ProfileHeaderCard(state = state)

        SectionHeader(title = "Thông tin cá nhân")
        when (val block = state.employee) {
            is ProfileBlock.Loading -> SkeletonBlock(heightDp = 180)
            is ProfileBlock.Failed -> HrmCard(modifier = Modifier.fillMaxWidth()) {
                ErrorState(message = block.message, onRetry = onRetry)
            }
            is ProfileBlock.Content -> EmployeeInfoCard(employee = block.value)
        }

        SectionHeader(title = "Kỹ năng của tôi")
        when (val block = state.skills) {
            is ProfileBlock.Loading -> SkeletonBlock(heightDp = 120)
            is ProfileBlock.Failed -> HrmCard(modifier = Modifier.fillMaxWidth()) {
                ErrorState(message = block.message, onRetry = onRetry)
            }
            is ProfileBlock.Content -> {
                if (block.value.isEmpty()) {
                    HrmCard(modifier = Modifier.fillMaxWidth()) {
                        EmptyState("Chưa có kỹ năng nào được ghi nhận. Liên hệ HR để cập nhật nhé.")
                    }
                } else {
                    HrmCard(modifier = Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                            block.value.forEach { skill -> SkillRow(skill = skill) }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(4.dp))
        Button(
            onClick = { showLogoutDialog = true },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.White,
                contentColor = DangerRed,
            ),
        ) {
            Text("Đăng xuất")
        }
        Spacer(Modifier.height(8.dp))
    }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Đăng xuất?") },
            text = { Text("Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng ứng dụng.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutDialog = false
                        onLogout()
                    },
                ) { Text("Đăng xuất", color = DangerRed) }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) { Text("Huỷ") }
            },
        )
    }
}

@Composable
private fun ProfileHeaderCard(state: ProfileUiState) {
    val employee = (state.employee as? ProfileBlock.Content)?.value
    val user = state.user
    val name = employee?.fullName ?: user?.fullName
    val position = employee?.positionTitle ?: user?.positionName
    val department = employee?.departmentName ?: user?.departmentName
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            InitialAvatar(name, 72)
            Spacer(Modifier.height(12.dp))
            Text(
                text = name ?: "—",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            val sub = listOfNotNull(position, department)
                .filter { it.isNotBlank() }
                .joinToString(" · ")
            if (sub.isNotBlank()) {
                Text(
                    text = sub,
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
            }
            val status = employee?.status
            if (status != null) {
                Spacer(Modifier.height(8.dp))
                val (label, bg, fg) = statusPresentation(status)
                StatusChip(text = label, bg = bg, fg = fg)
            }
        }
    }
}

@Composable
private fun EmployeeInfoCard(employee: EmployeeDto) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            InfoRow("Mã nhân viên", employee.code)
            InfoRow("Họ và tên", employee.fullName)
            InfoRow("Email", employee.email)
            InfoRow("Số điện thoại", employee.phone)
            InfoRow("Phòng ban", employee.departmentName)
            InfoRow("Chức danh", employee.positionTitle)
            InfoRow("Quản lý trực tiếp", employee.managerName)
            InfoRow(
                "Ngày vào làm",
                employee.startDate?.let { Format.date(it) },
            )
            InfoRow(
                "Ngày sinh",
                employee.dateOfBirth?.let { Format.date(it) },
            )
            InfoRow("Giới tính", genderLabel(employee.gender))
            InfoRow("Địa chỉ", employee.address, last = true)
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String?, last: Boolean = false) {
    if (value.isNullOrBlank()) return
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
            modifier = Modifier.padding(end = 16.dp),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
    if (!last) {
        androidx.compose.material3.HorizontalDivider()
    }
}

@Composable
private fun SkillRow(skill: EmployeeSkillDto) {
    val level = (skill.level ?: 0).coerceIn(0, 5)
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = skill.skillName ?: "Kỹ năng",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                )
                if (!skill.category.isNullOrBlank()) {
                    Text(
                        text = skill.category,
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            Text(
                text = "Mức $level/5",
                style = MaterialTheme.typography.labelMedium,
                color = BrandBlue,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Spacer(Modifier.height(6.dp))
        LinearProgressIndicator(
            progress = { level / 5f },
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(50)),
            color = BrandBlue,
            trackColor = BrandBlueSoft,
        )
    }
}

private fun statusPresentation(status: String): Triple<String, Color, Color> = when (status) {
    "working" -> Triple("Đang làm việc", BrandBlueSoft, SuccessGreen)
    "on_leave" -> Triple("Đang nghỉ phép", BrandBlueSoft, BrandBlue)
    "probation" -> Triple("Thử việc", BrandBlueSoft, BrandBlue)
    "resigned", "terminated" -> Triple("Đã nghỉ việc", BrandBlueSoft, DangerRed)
    else -> Triple(status, BrandBlueSoft, InkMuted)
}

private fun genderLabel(gender: String?): String? = when (gender?.lowercase()) {
    "male", "nam", "m" -> "Nam"
    "female", "nữ", "nu", "f" -> "Nữ"
    "other", "khác" -> "Khác"
    else -> gender
}
