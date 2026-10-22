package com.hrmai.app.feature.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.theme.BrandBlue

private val DEMO_ACCOUNTS = listOf(
    "Quản trị" to ("admin@hrm.local" to "Admin@123"),
    "Nhân sự" to ("hr@hrm.local" to "Hr@12345"),
    "Quản lý" to ("manager@hrm.local" to "Manager@123"),
    "Nhân viên" to ("employee@hrm.local" to "Employee@123"),
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LoginRoute(container: AppContainer) {
    val vm: LoginViewModel = viewModel(factory = LoginViewModel.Factory(container.sessionStore))
    val state by vm.state.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(72.dp))
        // Logo: khối xanh bo góc + chữ H (khớp logo web)
        Box(
            modifier = Modifier.size(72.dp).clip(RoundedCornerShape(18.dp)).background(BrandBlue),
            contentAlignment = Alignment.Center,
        ) {
            Text("H", color = Color.White, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(16.dp))
        Text("HRM AI", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(
            "Quản lý nhân sự thông minh",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(36.dp))

        OutlinedTextField(
            value = state.email,
            onValueChange = vm::onEmailChange,
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.password,
            onValueChange = vm::onPasswordChange,
            label = { Text("Mật khẩu") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )

        AnimatedVisibility(visible = state.showServerField) {
            Column(Modifier.fillMaxWidth()) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.baseUrl,
                    onValueChange = vm::onBaseUrlChange,
                    label = { Text("Địa chỉ máy chủ") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            TextButton(onClick = vm::toggleServerField) {
                Text(if (state.showServerField) "Ẩn địa chỉ máy chủ" else "Đổi máy chủ")
            }
        }

        if (state.error != null) {
            Text(
                text = state.error!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
        }

        Button(
            onClick = vm::login,
            enabled = !state.loading,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(12.dp),
        ) {
            if (state.loading) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(22.dp))
            } else {
                Text("Đăng nhập", style = MaterialTheme.typography.titleMedium)
            }
        }

        Spacer(Modifier.height(24.dp))
        Text(
            "Tài khoản demo — chạm để điền nhanh:",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            DEMO_ACCOUNTS.forEach { (label, creds) ->
                AssistChip(
                    onClick = { vm.fillDemo(creds.first, creds.second) },
                    label = { Text(label) },
                )
            }
        }
        Spacer(Modifier.height(32.dp))
    }
}
