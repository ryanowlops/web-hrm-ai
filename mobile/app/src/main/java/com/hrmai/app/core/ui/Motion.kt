package com.hrmai.app.core.ui

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.SharedTransitionScope
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.composed
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp

/**
 * Entrance cho item trong LazyColumn: mờ dần + trượt lên, lệch nhau theo index
 * (stagger ~40ms, chặn ở item thứ 8 để list dài không phải chờ lâu).
 * Chỉ chạy khi item xuất hiện lần đầu (remember + LaunchedEffect(Unit)) —
 * recompose không chạy lại. Lưu ý: item nào cuộn khỏi hẳn vùng đệm của
 * LazyColumn rồi quay lại sẽ chạy lại 1 lần (hành vi chuẩn của Compose).
 */
fun Modifier.listItemEnter(index: Int): Modifier = composed {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }
    val delay = index.coerceIn(0, 8) * 40
    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(durationMillis = 250, delayMillis = delay),
        label = "listEnterAlpha",
    )
    val offsetY by animateDpAsState(
        targetValue = if (visible) 0.dp else 14.dp,
        animationSpec = tween(durationMillis = 250, delayMillis = delay),
        label = "listEnterOffset",
    )
    this.alpha(alpha).offset(y = offsetY)
}

/** Cọ xám chạy ngang (shimmer) cho khung xương lúc tải dữ liệu. */
@Composable
fun shimmerBrush(): Brush {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val x by transition.animateFloat(
        initialValue = -400f,
        targetValue = 1200f,
        animationSpec = infiniteRepeatable(tween(1300), RepeatMode.Restart),
        label = "shimmerX",
    )
    return Brush.linearGradient(
        colors = listOf(Color(0xFFE4E7EC), Color(0xFFF2F4F7), Color(0xFFE4E7EC)),
        start = Offset(x - 320f, 0f),
        end = Offset(x, 0f),
    )
}

/**
 * Thẻ bấm vào: thu nhỏ nhẹ (0.97) + rung khẽ khi chạm, giữ ripple mặc định.
 * Dùng thay `.clickable { }` cho thẻ list. KHÔNG dùng cho Button (Button đã
 * có ripple riêng, gắn thêm clickable sẽ bấm 2 lần).
 */
fun Modifier.pressable(onClick: () -> Unit): Modifier = composed {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = tween(120),
        label = "pressScale",
    )
    val haptic = LocalHapticFeedback.current
    LaunchedEffect(pressed) {
        if (pressed) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }
    this
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(interactionSource = interactionSource) { onClick() }
}

/**
 * Shared element giữa 2 màn (vd tiêu đề Job ở list -> màn chi tiết).
 * Trả về đúng Modifier gốc khi chưa có scope (gọi độc lập vẫn an toàn).
 * Yêu cầu: cả 2 đầu dùng cùng key, đều nằm trong cùng SharedTransitionLayout.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.sharedContent(
    scope: SharedTransitionScope?,
    animatedVisibilityScope: AnimatedVisibilityScope?,
    key: String,
): Modifier {
    if (scope == null || animatedVisibilityScope == null) return this
    return with(scope) {
        this@sharedContent.sharedElement(
            state = rememberSharedContentState(key = key),
            animatedVisibilityScope = animatedVisibilityScope,
        )
    }
}
