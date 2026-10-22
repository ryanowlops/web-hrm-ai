package com.hrmai.app.feature.training

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.LoadingState
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber
import com.hrmai.app.core.util.Format

@Composable
fun TrainingRoute(container: AppContainer) {
    val vm: TrainingViewModel = viewModel(
        factory = TrainingViewModel.Factory(
            container.api(TrainingApi::class.java),
            container.sessionStore,
        ),
    )
    TrainingScreen(vm)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TrainingScreen(vm: TrainingViewModel) {
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        val msg = state.message ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        vm.consumeMessage()
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        Column(modifier = Modifier.fillMaxSize()) {
            TabRow(selectedTabIndex = state.tab) {
                listOf("Tất cả khoá học", "Khoá của tôi").forEachIndexed { index, label ->
                    Tab(
                        selected = state.tab == index,
                        onClick = { vm.selectTab(index) },
                        text = { Text(label) },
                    )
                }
            }
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when (state.tab) {
                    0 -> CoursesTab(state, vm)
                    else -> MyCoursesTab(state, vm)
                }
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }
}

// ---------------------------------------------------------------------------
// Tab: Tất cả khoá học
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CoursesTab(state: TrainingUiState, vm: TrainingViewModel) {
    PullToRefreshBox(
        isRefreshing = state.coursesRefreshing,
        onRefresh = { vm.refreshCourses() },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            state.coursesLoading -> LoadingState()
            state.coursesError != null -> ErrorState(state.coursesError, onRetry = { vm.loadCourses() })
            state.courses.isEmpty() -> EmptyState("Chưa có khoá học nào đang mở.")
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.courses, key = { it.id ?: 0 }) { course ->
                    CourseCard(
                        course = course,
                        enrollment = vm.enrollmentFor(course.id),
                        canSelfEnroll = vm.canSelfEnroll(),
                        enrolling = state.enrollingCourseId == course.id,
                        onEnroll = { vm.enrollCourse(course) },
                    )
                }
            }
        }
    }
}

@Composable
private fun CourseCard(
    course: CourseDto,
    enrollment: EnrollmentDto?,
    canSelfEnroll: Boolean,
    enrolling: Boolean,
    onEnroll: () -> Unit,
) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = course.title ?: "Khoá học",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (course.isMandatory == true) {
                    StatusChip("Bắt buộc", Color(0xFFFFFAEB), WarningAmber)
                }
                if (course.isActive == false) {
                    Spacer(Modifier.width(6.dp))
                    StatusChip("Đã tắt", Color(0xFFF2F4F7), InkMuted)
                }
            }
            val meta = listOfNotNull(
                course.category?.takeIf { it.isNotBlank() },
                course.durationHours?.takeIf { it > 0 }?.let { hours ->
                    if (hours % 1.0 == 0.0) "${hours.toInt()} giờ" else "$hours giờ"
                },
            )
            if (meta.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = meta.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            course.description?.takeIf { it.isNotBlank() }?.let { desc ->
                Spacer(Modifier.height(6.dp))
                Text(
                    text = desc,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            val total = course.enrollmentTotal
            val completed = course.enrollmentCompleted
            if (total != null && total > 0 && completed != null) {
                Spacer(Modifier.height(10.dp))
                LinearProgressIndicator(
                    progress = { (completed.toFloat() / total).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                    color = SuccessGreen,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "$completed/$total học viên đã hoàn thành",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Spacer(Modifier.height(10.dp))
            when {
                enrollment != null -> Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusChip(
                        text = enrollmentStatusLabel(enrollment.status),
                        bg = enrollmentStatusBg(enrollment.status),
                        fg = enrollmentStatusFg(enrollment.status),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "Tiến độ ${enrollment.progress ?: 0}%",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
                canSelfEnroll -> Button(
                    onClick = onEnroll,
                    enabled = !enrolling,
                ) {
                    if (enrolling) {
                        CircularProgressIndicator(
                            modifier = Modifier.height(16.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("Đăng ký học")
                }
                else -> Text(
                    text = "Khoá do HR gán học viên",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tab: Khoá của tôi
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MyCoursesTab(state: TrainingUiState, vm: TrainingViewModel) {
    PullToRefreshBox(
        isRefreshing = state.mineRefreshing,
        onRefresh = { vm.refreshMine() },
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            state.mineLoading -> LoadingState()
            state.mineError != null -> ErrorState(state.mineError, onRetry = { vm.loadMine() })
            state.mine.isEmpty() -> EmptyState(
                "Bạn chưa được gán khoá học nào. Khi HR gán khoá, khoá sẽ hiện ở đây.",
            )
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(state.mine, key = { it.id ?: 0 }) { enrollment ->
                    MyEnrollmentCard(
                        enrollment = enrollment,
                        updating = state.updatingEnrollmentId == enrollment.id,
                        vm = vm,
                    )
                }
            }
        }
    }
}

@Composable
private fun MyEnrollmentCard(
    enrollment: EnrollmentDto,
    updating: Boolean,
    vm: TrainingViewModel,
) {
    val course = enrollment.course
    val progress = enrollment.progress ?: 0
    var draft by remember(enrollment.id, progress) { mutableFloatStateOf(progress.toFloat()) }

    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = enrollment.courseTitle ?: course?.title ?: "Khoá học",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                StatusChip(
                    text = enrollmentStatusLabel(enrollment.status),
                    bg = enrollmentStatusBg(enrollment.status),
                    fg = enrollmentStatusFg(enrollment.status),
                )
            }
            val meta = listOfNotNull(
                course?.category?.takeIf { it.isNotBlank() },
                enrollment.enrolledByName?.let { "Được gán bởi $it" },
                if (enrollment.status == TrainingViewModel.STATUS_COMPLETED) {
                    enrollment.completedAt?.let { "Hoàn thành ${Format.date(it)}" }
                } else {
                    null
                },
            )
            if (meta.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = meta.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LinearProgressIndicator(
                    progress = { (progress / 100f).coerceIn(0f, 1f) },
                    modifier = Modifier.weight(1f),
                    color = if (enrollment.status == TrainingViewModel.STATUS_COMPLETED) {
                        SuccessGreen
                    } else {
                        BrandBlue
                    },
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    text = "$progress%",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            if (enrollment.status != TrainingViewModel.STATUS_COMPLETED) {
                Spacer(Modifier.height(6.dp))
                Slider(
                    value = draft,
                    onValueChange = { draft = it },
                    onValueChangeFinished = {
                        val newProgress = draft.toInt()
                        if (newProgress != progress) vm.updateProgress(enrollment, newProgress)
                    },
                    valueRange = 0f..100f,
                    steps = 19,
                    enabled = !updating,
                )
                Text(
                    text = "Kéo để cập nhật tiến độ học (mỗi nấc 5%).",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (enrollment.status == TrainingViewModel.STATUS_ASSIGNED) {
                        Button(
                            onClick = { vm.startLearning(enrollment) },
                            enabled = !updating,
                        ) { Text("Bắt đầu học") }
                    }
                    OutlinedButton(
                        onClick = { vm.markCompleted(enrollment) },
                        enabled = !updating,
                    ) {
                        if (updating) {
                            CircularProgressIndicator(
                                modifier = Modifier.height(16.dp),
                                color = BrandBlue,
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(8.dp))
                        }
                        Text("Đánh dấu hoàn thành")
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Nhãn trạng thái ghi danh (khớp CourseEnrollment.STATUSES của server)
// ---------------------------------------------------------------------------

private fun enrollmentStatusLabel(status: String?): String = when (status) {
    TrainingViewModel.STATUS_IN_PROGRESS -> "Đang học"
    TrainingViewModel.STATUS_COMPLETED -> "Đã hoàn thành"
    else -> "Đã gán"
}

private fun enrollmentStatusBg(status: String?): Color = when (status) {
    TrainingViewModel.STATUS_IN_PROGRESS -> BrandBlueSoft
    TrainingViewModel.STATUS_COMPLETED -> Color(0xFFECFDF3)
    else -> Color(0xFFF2F4F7)
}

private fun enrollmentStatusFg(status: String?): Color = when (status) {
    TrainingViewModel.STATUS_IN_PROGRESS -> BrandBlue
    TrainingViewModel.STATUS_COMPLETED -> SuccessGreen
    else -> InkMuted
}
