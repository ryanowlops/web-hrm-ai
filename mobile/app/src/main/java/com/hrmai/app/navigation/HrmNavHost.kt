package com.hrmai.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.hrmai.app.core.di.AppContainer

/** Điều hướng gốc của app — bản khung, sẽ mở rộng khi tích hợp tính năng. */
@Composable
fun HrmNavHost(container: AppContainer) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = "HRM AI — đang dựng khung", style = MaterialTheme.typography.titleMedium)
    }
}
