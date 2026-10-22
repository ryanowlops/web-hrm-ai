package com.hrmai.app.core.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Bảng màu khớp nhận diện bản web v4: brand #274FEA, nền xám rất nhạt,
// thẻ trắng viền mảnh, chữ xám đậm.
val BrandBlue = Color(0xFF274FEA)
val BrandBlueDark = Color(0xFF1D3FBF)
val BrandBlueSoft = Color(0xFFEEF2FF)
val InkDark = Color(0xFF101828)
val InkMuted = Color(0xFF667085)
val CanvasGray = Color(0xFFF9FAFB)
val BorderGray = Color(0xFFEAECF0)
val SuccessGreen = Color(0xFF067647)
val WarningAmber = Color(0xFFB54708)
val DangerRed = Color(0xFFB42318)

private val LightScheme = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Color.White,
    primaryContainer = BrandBlueSoft,
    onPrimaryContainer = BrandBlueDark,
    secondary = Color(0xFF475467),
    onSecondary = Color.White,
    background = CanvasGray,
    onBackground = InkDark,
    surface = Color.White,
    onSurface = InkDark,
    surfaceVariant = Color(0xFFF2F4F7),
    onSurfaceVariant = InkMuted,
    outline = BorderGray,
    error = DangerRed,
    onError = Color.White,
)

@Composable
fun HrmTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = LightScheme, content = content)
}
