package com.hrmai.app.feature.chatbot

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BorderGray
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkDark
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import java.time.LocalDate

/** Câu hỏi mẫu về quy chế (hiện khi hội thoại trống + hàng gợi ý). */
private val POLICY_SUGGESTIONS = listOf(
    "Tôi có bao nhiêu ngày phép năm?",
    "Quy trình xin nghỉ phép gồm những bước nào?",
    "Chính sách phúc lợi của công ty gồm những gì?",
    "Quy định về giờ làm việc và đi muộn?",
)

/** Câu hỏi tra DỮ LIỆU TRỰC TIẾP (tool layer) — bấm là gửi ngay. */
private val LIVE_SUGGESTIONS = listOf(
    "Tôi còn bao nhiêu ngày phép?",
    "Phiếu lương tháng này của tôi",
    "Hôm nay ai đang nghỉ phép?",
    "Chấm công tháng này của tôi",
)

/** Nhãn chế độ truy hồi RAG (khớp bản web). */
private val RETRIEVAL_LABELS = mapOf(
    "hybrid_rerank" to "Truy hồi: Lai + xếp hạng lại",
    "hybrid" to "Truy hồi: Lai (vector + từ khoá)",
    "embedding" to "Truy hồi: Vector",
    "keyword" to "Truy hồi: Từ khoá",
)

@Composable
fun ChatbotRoute(container: AppContainer) {
    val vm: ChatViewModel = viewModel(
        factory = ChatViewModel.Factory(
            container.api(ChatApi::class.java),
            container.sessionStore,
        ),
    )
    val state by vm.state.collectAsState()
    val session by container.sessionStore.sessionFlow.collectAsState()
    ChatbotScreen(
        state = state,
        userName = session?.user?.fullName,
        userRole = session?.user?.role?.lowercase(),
        onSend = vm::send,
        onRetryLast = vm::retryLast,
        onConfirmAction = vm::confirmAction,
        onCancelAction = vm::cancelAction,
    )
}

@Composable
private fun ChatbotScreen(
    state: ChatUiState,
    userName: String?,
    userRole: String?,
    onSend: (String) -> Unit,
    onRetryLast: () -> Unit,
    onConfirmAction: (String) -> Unit,
    onCancelAction: (String) -> Unit,
) {
    var input by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()

    // Tự cuộn xuống cuối khi có tin mới / trạng thái gửi thay đổi.
    LaunchedEffect(state.messages.size, state.sending) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.lastIndex)
        }
    }

    fun submit(text: String) {
        val q = text.trim()
        if (q.isEmpty() || state.sending) return
        input = ""
        onSend(q)
    }

    Column(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        ChatHeader()
        Box(modifier = Modifier.weight(1f)) {
            when {
                state.historyLoading && state.messages.isEmpty() -> LoadingState()
                state.messages.isEmpty() -> EmptyConversation(onPick = { submit(it) })
                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    items(state.messages, key = { it.id }) { msg ->
                        MessageRow(
                            msg = msg,
                            userName = userName,
                            showRetry = msg.isError && state.lastFailedQuestion != null && !state.sending,
                            onRetry = onRetryLast,
                            onConfirmAction = onConfirmAction,
                            onCancelAction = onCancelAction,
                        )
                    }
                }
            }
        }
        SuggestionBar(
            sending = state.sending,
            userRole = userRole,
            onPick = { submit(it) },
        )
        InputBar(
            input = input,
            onInputChange = { input = it },
            sending = state.sending,
            onSubmit = { submit(input) },
        )
    }
}

/* --------------------------------- Header --------------------------------- */

@Composable
private fun ChatHeader() {
    Surface(color = Color.White, shadowElevation = 0.dp) {
        Row(
            modifier = Modifier.fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(38.dp).clip(RoundedCornerShape(10.dp))
                    .background(BrandBlue),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.SmartToy,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Chatbot HR",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = InkDark,
                    )
                    Spacer(Modifier.width(6.dp))
                    StatusChip(text = "AI", bg = BrandBlueSoft, fg = BrandBlue)
                }
                Text(
                    text = "Trả lời từ tài liệu quy chế, kèm nguồn trích dẫn",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

/* ------------------------------ Hội thoại trống ---------------------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EmptyConversation(onPick: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier.size(56.dp).clip(RoundedCornerShape(16.dp))
                .background(BrandBlueSoft),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.SmartToy,
                contentDescription = null,
                tint = BrandBlue,
                modifier = Modifier.size(30.dp),
            )
        }
        Spacer(Modifier.height(14.dp))
        Text(
            text = "Xin chào! Bạn muốn hỏi gì về quy chế công ty?",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = InkDark,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Thử một câu hỏi mẫu:",
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
        )
        Spacer(Modifier.height(14.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            POLICY_SUGGESTIONS.forEach { s -> SuggestionChip(text = s, onClick = { onPick(s) }) }
        }
    }
}

/* ------------------------------- Hàng gợi ý -------------------------------- */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SuggestionBar(
    sending: Boolean,
    userRole: String?,
    onPick: (String) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().background(Color.White)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SuggestionChip(
                text = "Xin nghỉ phép giúp tôi…",
                enabled = !sending,
                accent = true,
                onClick = { onPick("Xin nghỉ phép giúp tôi…") },
            )
            if (userRole in listOf("manager", "hr", "admin")) {
                SuggestionChip(
                    text = "Duyệt đơn đang chờ của team tôi",
                    enabled = !sending,
                    accent = true,
                    onClick = { onPick("Duyệt đơn đang chờ của team tôi") },
                )
            }
            LIVE_SUGGESTIONS.forEach { s ->
                SuggestionChip(text = s, enabled = !sending, onClick = { onPick(s) })
            }
        }
    }
}

@Composable
private fun SuggestionChip(
    text: String,
    enabled: Boolean = true,
    accent: Boolean = false,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (accent) BrandBlueSoft else Color.White)
            .border(1.dp, if (accent) BrandBlue else BorderGray, RoundedCornerShape(10.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 7.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            color = if (accent) BrandBlue else InkDark,
            fontWeight = FontWeight.Medium,
        )
    }
}

/* -------------------------------- Ô nhập ---------------------------------- */

@Composable
private fun InputBar(
    input: String,
    onInputChange: (String) -> Unit,
    sending: Boolean,
    onSubmit: () -> Unit,
) {
    Surface(color = Color.White, shadowElevation = 0.dp) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = onInputChange,
                modifier = Modifier.weight(1f).onKeyEvent { event ->
                    if (event.key == Key.Enter && event.type == KeyEventType.KeyUp) {
                        onSubmit()
                        true
                    } else {
                        false
                    }
                },
                placeholder = { Text("Nhập câu hỏi về quy chế, nghỉ phép…") },
                maxLines = 4,
                shape = RoundedCornerShape(14.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onSubmit() }),
            )
            Spacer(Modifier.width(8.dp))
            IconButton(
                onClick = onSubmit,
                enabled = input.isNotBlank() && !sending,
                modifier = Modifier.size(48.dp).clip(CircleShape)
                    .background(if (input.isNotBlank() && !sending) BrandBlue else BorderGray),
            ) {
                Icon(
                    imageVector = Icons.Filled.Send,
                    contentDescription = "Gửi câu hỏi",
                    tint = Color.White,
                )
            }
        }
    }
}

/* -------------------------------- Tin nhắn --------------------------------- */

@Composable
private fun MessageRow(
    msg: ChatMessage,
    userName: String?,
    showRetry: Boolean,
    onRetry: () -> Unit,
    onConfirmAction: (String) -> Unit,
    onCancelAction: (String) -> Unit,
) {
    if (msg.fromUser) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.Top,
        ) {
            Column(
                horizontalAlignment = Alignment.End,
                modifier = Modifier.widthIn(max = 300.dp),
            ) {
                Box(
                    modifier = Modifier.clip(
                        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 4.dp),
                    ).background(BrandBlue).padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    Text(
                        text = msg.text,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White,
                    )
                }
                TimeLabel(msg.createdAt, alignEnd = true)
            }
            Spacer(Modifier.width(8.dp))
            InitialAvatar(name = userName, sizeDp = 30)
        }
    } else {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Start,
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier.size(30.dp).clip(RoundedCornerShape(9.dp))
                    .background(BrandBlue),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.SmartToy,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(17.dp),
                )
            }
            Spacer(Modifier.width(8.dp))
            Column(
                horizontalAlignment = Alignment.Start,
                modifier = Modifier.widthIn(max = 320.dp),
            ) {
                when {
                    msg.isTyping -> TypingBubble()
                    msg.isError -> {
                        Box(
                            modifier = Modifier.clip(
                                RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp),
                            ).background(Color(0xFFFEF3F2)).padding(horizontal = 14.dp, vertical = 10.dp),
                        ) {
                            Text(
                                text = msg.text,
                                style = MaterialTheme.typography.bodyMedium,
                                color = DangerRed,
                            )
                        }
                        if (showRetry) {
                            TextButton(onClick = onRetry) { Text("Thử gửi lại") }
                        }
                    }
                    else -> {
                        Box(
                            modifier = Modifier.clip(
                                RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp),
                            ).background(Color.White)
                                .border(1.dp, BorderGray, RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp))
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                        ) {
                            Text(
                                text = msg.text,
                                style = MaterialTheme.typography.bodyMedium,
                                color = InkDark,
                            )
                        }
                        if (msg.sources.isNotEmpty()) {
                            SourcesSection(sources = msg.sources)
                        }
                        if (msg.action != null) {
                            Spacer(Modifier.height(8.dp))
                            ActionCard(
                                msg = msg,
                                onConfirm = { onConfirmAction(msg.id) },
                                onCancel = { onCancelAction(msg.id) },
                            )
                        }
                        ModeRow(msg)
                    }
                }
                if (!msg.isTyping) TimeLabel(msg.createdAt, alignEnd = false)
            }
        }
    }
}

@Composable
private fun TimeLabel(raw: String?, alignEnd: Boolean) {
    val parsed = Format.parseDateTime(raw) ?: return
    val label = if (parsed.toLocalDate() == LocalDate.now(Format.ICT)) {
        Format.time(raw)
    } else {
        Format.dateTime(raw)
    }
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        color = InkMuted,
        modifier = Modifier.fillMaxWidth().padding(top = 3.dp),
        textAlign = if (alignEnd) androidx.compose.ui.text.style.TextAlign.End
        else androidx.compose.ui.text.style.TextAlign.Start,
    )
}

/* ------------------------- Bong bóng "đang soạn…" -------------------------- */

@Composable
private fun TypingBubble() {
    val transition = rememberInfiniteTransition(label = "typing")
    Row(
        modifier = Modifier.clip(
            RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp),
        ).background(Color.White)
            .border(1.dp, BorderGray, RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp))
            .padding(horizontal = 14.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(3) { i ->
            val alpha by transition.animateFloat(
                initialValue = 0.25f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    tween(durationMillis = 450, delayMillis = i * 150),
                    RepeatMode.Reverse,
                ),
                label = "dot$i",
            )
            Box(
                modifier = Modifier.size(7.dp).alpha(alpha)
                    .clip(CircleShape).background(InkMuted),
            )
        }
    }
}

/* ------------------------------- Nguồn trích dẫn --------------------------- */

@Composable
private fun SourcesSection(sources: List<ChatSource>) {
    var expanded by remember { mutableStateOf(false) }
    Column(modifier = Modifier.padding(top = 8.dp)) {
        Row(
            modifier = Modifier.clickable { expanded = !expanded }
                .padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Nguồn trích dẫn (${sources.size})",
                style = MaterialTheme.typography.labelLarge,
                color = InkMuted,
                fontWeight = FontWeight.SemiBold,
            )
            Icon(
                imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                contentDescription = null,
                tint = InkMuted,
                modifier = Modifier.size(18.dp),
            )
        }
        if (expanded) {
            Spacer(Modifier.height(4.dp))
            sources.forEach { s ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Description,
                        contentDescription = null,
                        tint = BrandBlue,
                        modifier = Modifier.size(15.dp).padding(top = 1.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Column {
                        Text(
                            text = s.title + (s.page?.let { " · trang $it" } ?: ""),
                            style = MaterialTheme.typography.labelLarge,
                            color = InkDark,
                            fontWeight = FontWeight.Medium,
                        )
                        if (s.excerpt.isNotBlank()) {
                            Text(
                                text = s.excerpt,
                                style = MaterialTheme.typography.bodySmall,
                                color = InkMuted,
                                maxLines = 3,
                            )
                        }
                    }
                }
            }
        }
    }
}

/* -------------------------------- Thẻ hành động ---------------------------- */

@Composable
private fun ActionCard(
    msg: ChatMessage,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    val action = msg.action ?: return
    val status = msg.actionStatus
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = action.displayTitle,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = InkDark,
                    modifier = Modifier.weight(1f),
                )
                when (status) {
                    ActionStatus.DONE ->
                        StatusChip("Đã thực hiện", Color(0xFFECFDF3), SuccessGreen)
                    ActionStatus.FAILED ->
                        StatusChip("Chưa thực hiện được", Color(0xFFFEF3F2), DangerRed)
                    ActionStatus.CANCELLED ->
                        StatusChip("Đã huỷ", Color(0xFFF2F4F7), InkMuted)
                    ActionStatus.HISTORY ->
                        StatusChip("Từ lịch sử", Color(0xFFF2F4F7), InkMuted)
                    else -> Unit
                }
            }
            if (action.summary.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = action.summary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = InkMuted,
                )
            }
            if (action.details.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                action.details.forEach { d ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                        Text(
                            text = d.label,
                            style = MaterialTheme.typography.bodyMedium,
                            color = InkMuted,
                            modifier = Modifier.width(110.dp),
                        )
                        Text(
                            text = d.value,
                            style = MaterialTheme.typography.bodyMedium,
                            color = InkDark,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
            msg.actionError?.let { err ->
                Spacer(Modifier.height(10.dp))
                Box(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFFFEF3F2)).padding(10.dp),
                ) {
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodyMedium,
                        color = DangerRed,
                    )
                }
            }
            when (status) {
                ActionStatus.PENDING, ActionStatus.EXECUTING -> {
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = onConfirm,
                            enabled = status == ActionStatus.PENDING,
                        ) {
                            if (status == ActionStatus.EXECUTING) {
                                CircularProgressIndicator(
                                    color = Color.White,
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                )
                                Spacer(Modifier.width(8.dp))
                            }
                            Text("Xác nhận thực hiện")
                        }
                        OutlinedButton(
                            onClick = onCancel,
                            enabled = status == ActionStatus.PENDING,
                        ) {
                            Text("Huỷ")
                        }
                    }
                }
                ActionStatus.HISTORY -> {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = "Thẻ hành động từ lịch sử trò chuyện — không thực hiện " +
                            "lại từ đây. Muốn thực hiện, hãy nhắn lại yêu cầu để " +
                            "chatbot soạn thẻ mới.",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                else -> Unit
            }
        }
    }
}

/* --------------------------------- Chip chế độ ----------------------------- */

@Composable
private fun ModeRow(msg: ChatMessage) {
    if (msg.isError) return
    Row(
        modifier = Modifier.padding(top = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (msg.mode) {
            "live_data" ->
                StatusChip("Dữ liệu trực tiếp", Color(0xFFECFDF3), SuccessGreen)
            "action" ->
                StatusChip("Hành động chờ xác nhận", Color(0xFFF4F3FF), Color(0xFF6941C6))
            "rag" -> {
                StatusChip("Tài liệu nội bộ", BrandBlueSoft, BrandBlue)
                RETRIEVAL_LABELS[msg.retrievalMode]?.let { label ->
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        color = WarningAmber,
                    )
                }
            }
            else -> Unit
        }
    }
}
