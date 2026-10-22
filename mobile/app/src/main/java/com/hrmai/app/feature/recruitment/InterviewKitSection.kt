package com.hrmai.app.feature.recruitment

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.SectionHeader
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueDark
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format
import kotlinx.coroutines.delay

// ---------------------------------------------------------------------------
// Section "Bộ câu hỏi phỏng vấn" trong màn chi tiết tin tuyển dụng.
// Tự chứa toàn bộ trạng thái (tải/sinh/sửa) qua InterviewKitViewModel:
// - Chưa có kit (404): EmptyState + nút "Tạo bằng AI".
// - 403 (không phải admin/hr): thông báo giới hạn quyền thân thiện.
// - Có kit: chip nguồn (AI/bản mẫu) + phiên bản, danh sách câu hỏi theo
//   3 vòng; chạm "Sửa" ở từng câu để sửa tại chỗ; "Tạo lại" có xác nhận
//   vì sẽ ghi đè toàn bộ bộ hiện tại.
// ---------------------------------------------------------------------------

@Composable
fun InterviewKitSection(
    container: AppContainer,
    jobId: Int,
    modifier: Modifier = Modifier,
) {
    val vm: InterviewKitViewModel = viewModel(
        key = "interview-kit-$jobId",
        factory = InterviewKitViewModel.Factory(
            api = container.api(InterviewKitApi::class.java),
            sessionStore = container.sessionStore,
            jobId = jobId,
        ),
    )
    val state by vm.state.collectAsState()
    InterviewKitContent(state = state, vm = vm, modifier = modifier)
}

@Composable
private fun InterviewKitContent(
    state: InterviewKitUiState,
    vm: InterviewKitViewModel,
    modifier: Modifier = Modifier,
) {
    var confirmRegenerate by remember { mutableStateOf(false) }
    var editIndex by remember { mutableStateOf<Int?>(null) }
    val busy = state.generating || state.saving
    val kit = state.kit

    LaunchedEffect(state.message) {
        if (state.message != null) {
            delay(5000)
            vm.consumeMessage()
        }
    }

    HrmCard(modifier = modifier.fillMaxWidth()) {
        Column {
            SectionHeader(title = "Bộ câu hỏi phỏng vấn")

            state.message?.let { message ->
                Spacer(Modifier.height(6.dp))
                Text(
                    message,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (state.messageIsError) DangerRed else SuccessGreen,
                )
            }

            when {
                state.loading && kit == null -> LoadingState()

                state.forbidden && kit == null -> {
                    Spacer(Modifier.height(8.dp))
                    EmptyState("Bộ câu hỏi phỏng vấn chỉ dành cho HR/quản lý.")
                }

                state.error != null && kit == null -> {
                    Spacer(Modifier.height(8.dp))
                    ErrorState(
                        message = state.error ?: "Không tải được bộ câu hỏi phỏng vấn.",
                        onRetry = { vm.load() },
                    )
                }

                state.generating && kit == null -> {
                    Spacer(Modifier.height(10.dp))
                    GeneratingWaitRow()
                }

                state.noKit && kit == null -> {
                    Spacer(Modifier.height(8.dp))
                    EmptyState(
                        "Tin này chưa có bộ câu hỏi phỏng vấn.\n" +
                            "Tạo tự động bằng AI từ mô tả công việc của tin nhé.",
                    )
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = { vm.generate() },
                        enabled = !busy,
                        colors = ButtonDefaults.buttonColors(containerColor = BrandBlue),
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    ) {
                        Text("Tạo bằng AI")
                    }
                }

                kit != null -> {
                    KitBody(
                        kit = kit,
                        generating = state.generating,
                        busy = busy,
                        onRegenerate = { confirmRegenerate = true },
                        onEdit = { index -> editIndex = index },
                    )
                }

                else -> {
                    Spacer(Modifier.height(8.dp))
                    EmptyState("Chưa có dữ liệu bộ câu hỏi.")
                }
            }
        }
    }

    if (confirmRegenerate) {
        AlertDialog(
            onDismissRequest = { confirmRegenerate = false },
            title = { Text("Tạo lại bộ câu hỏi?") },
            text = {
                Text(
                    "AI sẽ sinh một bộ câu hỏi hoàn toàn mới và GHI ĐÈ bộ hiện tại " +
                        "(kể cả các câu bạn đã sửa tay). Phiên bản sẽ tăng lên " +
                        "${(kit?.version ?: 1) + 1}.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            confirmButton = {
                TextButton(
                    enabled = !busy,
                    onClick = {
                        confirmRegenerate = false
                        vm.generate()
                    },
                ) {
                    Text("Tạo lại", color = BrandBlue)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmRegenerate = false }) { Text("Huỷ") }
            },
        )
    }

    val editing = editIndex?.let { idx ->
        kit?.questions?.getOrNull(idx)?.let { idx to it }
    }
    if (editing != null) {
        val (index, question) = editing
        EditQuestionDialog(
            question = question,
            onDismiss = { editIndex = null },
            onConfirm = { updated ->
                vm.updateQuestion(index, updated)
                editIndex = null
            },
        )
    }
}

@Composable
private fun GeneratingWaitRow(text: String = "Đang tạo bộ câu hỏi bằng AI — có thể mất 10–30 giây, bạn chờ chút nhé.") {
    Row(verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(
            modifier = Modifier.size(20.dp),
            strokeWidth = 2.dp,
            color = BrandBlue,
        )
        Spacer(Modifier.width(10.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = InkMuted)
    }
}

@Composable
private fun KitBody(
    kit: InterviewKitDto,
    generating: Boolean,
    busy: Boolean,
    onRegenerate: () -> Unit,
    onEdit: (Int) -> Unit,
) {
    val questions = kit.questions ?: emptyList()
    val totalWeight = questions.sumOf { it.weight ?: 0.0 }

    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        val (srcBg, srcFg) = if (kit.generatedBy == "ai") {
            BrandBlueSoft to BrandBlueDark
        } else {
            Color(0xFFFFFAEB) to WarningAmber
        }
        StatusChip(interviewKitSourceLabel(kit.generatedBy), srcBg, srcFg)
        StatusChip(
            "Phiên bản ${kit.version ?: 1}",
            Color(0xFFF2F4F7),
            InkMuted,
        )
        StatusChip(
            "Tổng trọng số ${formatWeight(totalWeight)}",
            Color(0xFFF2F4F7),
            InkMuted,
        )
    }
    if (!kit.updatedAt.isNullOrBlank()) {
        Spacer(Modifier.height(6.dp))
        Text(
            "Cập nhật gần nhất ${Format.dateTime(kit.updatedAt)}",
            style = MaterialTheme.typography.bodySmall,
            color = InkMuted,
        )
    }

    val indexed = questions.withIndex().toList()
    listOf(1, 2, 3).forEach { round ->
        val roundItems = indexed.filter { it.value.round == round }
        if (roundItems.isEmpty()) return@forEach
        Spacer(Modifier.height(14.dp))
        Text(
            "Vòng $round · ${interviewRoundLabel(round)}",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = BrandBlueDark,
        )
        roundItems.forEachIndexed { pos, (index, question) ->
            if (pos > 0) {
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = 10.dp),
                    color = Color(0xFFEAECF0),
                )
            } else {
                Spacer(Modifier.height(8.dp))
            }
            QuestionRow(question = question, busy = busy, onEdit = { onEdit(index) })
        }
    }
    val others = indexed.filter { (it.value.round ?: 0) !in 1..3 }
    if (others.isNotEmpty()) {
        Spacer(Modifier.height(14.dp))
        Text(
            "Câu hỏi khác",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = BrandBlueDark,
        )
        others.forEachIndexed { pos, (index, question) ->
            if (pos > 0) {
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = 10.dp),
                    color = Color(0xFFEAECF0),
                )
            } else {
                Spacer(Modifier.height(8.dp))
            }
            QuestionRow(question = question, busy = busy, onEdit = { onEdit(index) })
        }
    }

    Spacer(Modifier.height(14.dp))
    if (generating) {
        GeneratingWaitRow(text = "Đang tạo lại bộ câu hỏi bằng AI — có thể mất 10–30 giây…")
    } else {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
        ) {
            TextButton(onClick = onRegenerate, enabled = !busy) {
                Text("Tạo lại bằng AI", color = BrandBlue)
            }
        }
    }
}

@Composable
private fun QuestionRow(
    question: InterviewQuestionDto,
    busy: Boolean,
    onEdit: () -> Unit,
) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            question.topic?.takeIf { it.isNotBlank() }?.let { topic ->
                StatusChip(topic, Color(0xFFF2F4F7), InkMuted)
            }
            StatusChip(formatWeight(question.weight), BrandBlueSoft, BrandBlueDark)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onEdit, enabled = !busy) {
                Text("Sửa", color = BrandBlue)
            }
        }
        Text(
            question.question ?: "",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
        if (!question.rubric.isNullOrBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(
                question.rubric,
                style = MaterialTheme.typography.bodySmall,
                color = InkMuted,
            )
        }
    }
}

/** Hộp thoại sửa 1 câu hỏi; lưu là PUT cả bộ (giữ nguyên các câu còn lại). */
@Composable
private fun EditQuestionDialog(
    question: InterviewQuestionDto,
    onDismiss: () -> Unit,
    onConfirm: (InterviewQuestionDto) -> Unit,
) {
    var topic by remember(question) { mutableStateOf(question.topic ?: "") }
    var text by remember(question) { mutableStateOf(question.question ?: "") }
    var rubric by remember(question) { mutableStateOf(question.rubric ?: "") }
    var weightText by remember(question) {
        mutableStateOf(
            question.weight?.let { w ->
                if (w % 1.0 == 0.0) w.toInt().toString()
                else w.toString().replace('.', ',')
            } ?: "",
        )
    }
    val weight = weightText.replace(',', '.').toDoubleOrNull()
    val weightError = weightText.isNotBlank() && (weight == null || weight <= 0)
    val valid = topic.isNotBlank() && text.isNotBlank() && rubric.isNotBlank() &&
        weight != null && weight > 0

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sửa câu hỏi — Vòng ${question.round ?: "—"}") },
        text = {
            Column {
                OutlinedTextField(
                    value = topic,
                    onValueChange = { topic = it },
                    label = { Text("Chủ đề") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text("Câu hỏi") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = rubric,
                    onValueChange = { rubric = it },
                    label = { Text("Tiêu chí chấm (rubric)") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = weightText,
                    onValueChange = { weightText = it },
                    label = { Text("Trọng số (%)") },
                    singleLine = true,
                    isError = weightError,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    if (weightError) {
                        "Trọng số phải là số lớn hơn 0."
                    } else {
                        "Sau khi lưu, server tự chuẩn hoá tổng trọng số của cả bộ về 100%."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (weightError) DangerRed else InkMuted,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = {
                    onConfirm(
                        question.copy(
                            topic = topic.trim(),
                            question = text.trim(),
                            rubric = rubric.trim(),
                            weight = weight,
                        ),
                    )
                },
            ) {
                Text("Lưu thay đổi", color = BrandBlue)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Huỷ") }
        },
    )
}

/** 13.3 -> "13,3%"; 10.0 -> "10%". */
private fun formatWeight(weight: Double?): String {
    val w = weight ?: return "—"
    val text = if (w % 1.0 == 0.0) {
        w.toInt().toString()
    } else {
        String.format(java.util.Locale.US, "%.1f", w).replace('.', ',')
    }
    return "$text%"
}
