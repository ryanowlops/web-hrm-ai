package com.hrmai.app.feature.feed

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.ModeComment
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hrmai.app.core.di.AppContainer
import com.hrmai.app.core.ui.EmptyState
import com.hrmai.app.core.ui.ErrorState
import com.hrmai.app.core.ui.HrmCard
import com.hrmai.app.core.ui.InitialAvatar
import com.hrmai.app.core.ui.SkeletonBlock
import com.hrmai.app.core.ui.StatusChip
import com.hrmai.app.core.ui.theme.BrandBlue
import com.hrmai.app.core.ui.theme.BrandBlueSoft
import com.hrmai.app.core.ui.theme.CanvasGray
import com.hrmai.app.core.ui.theme.DangerRed
import com.hrmai.app.core.ui.theme.InkMuted
import com.hrmai.app.core.ui.theme.SuccessGreen
import com.hrmai.app.core.ui.theme.WarningAmber

@Composable
fun FeedRoute(container: AppContainer) {
    val vm: FeedViewModel = viewModel(
        factory = FeedViewModel.Factory(
            container.api(FeedApi::class.java),
            container.sessionStore,
        )
    )
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbar.showSnackbar(it)
            vm.consumeToast()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(CanvasGray)) {
        FeedScreen(state = state, vm = vm)
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp),
        )
    }

    if (state.deletePostTarget != null) {
        AlertDialog(
            onDismissRequest = { vm.cancelDeletePost() },
            title = { Text("Xoá bài viết?") },
            text = { Text("Bài viết cùng mọi bình luận sẽ bị xoá và không khôi phục được.") },
            confirmButton = {
                TextButton(onClick = { vm.confirmDeletePost() }) {
                    Text("Xoá", color = DangerRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { vm.cancelDeletePost() }) { Text("Huỷ") }
            },
        )
    }

    if (state.deleteCommentTarget != null) {
        AlertDialog(
            onDismissRequest = { vm.cancelDeleteComment() },
            title = { Text("Xoá bình luận?") },
            text = { Text("Bình luận này sẽ bị xoá khỏi bài viết.") },
            confirmButton = {
                TextButton(onClick = { vm.confirmDeleteComment() }) {
                    Text("Xoá", color = DangerRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { vm.cancelDeleteComment() }) { Text("Huỷ") }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FeedScreen(state: FeedUiState, vm: FeedViewModel) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Bảng tin",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp),
        )
        Text(
            text = "Nơi mọi người chia sẻ và cập nhật tin tức nội bộ",
            style = MaterialTheme.typography.bodyMedium,
            color = InkMuted,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
        )

        when {
            state.loading -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SkeletonBlock(heightDp = 120)
                    SkeletonBlock(heightDp = 160)
                    SkeletonBlock(heightDp = 160)
                }
            }
            state.error != null && state.posts.isEmpty() -> {
                ErrorState(message = state.error, onRetry = { vm.load() })
            }
            else -> {
                PullToRefreshBox(
                    isRefreshing = state.refreshing,
                    onRefresh = { vm.refresh() },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        item { ComposerCard(state = state, vm = vm) }
                        if (state.posts.isEmpty()) {
                            item {
                                EmptyState("Chưa có bài viết nào. Hãy là người chia sẻ đầu tiên nhé!")
                            }
                        } else {
                            items(state.posts, key = { it.id ?: 0 }) { post ->
                                PostCard(post = post, state = state, vm = vm)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ComposerCard(state: FeedUiState, vm: FeedViewModel) {
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Text(
                text = "Chia sẻ với mọi người",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = state.draft,
                onValueChange = { vm.onDraftChange(it) },
                placeholder = { Text("Bạn đang nghĩ gì?") },
                minLines = 2,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Button(
                    onClick = { vm.submitPost() },
                    enabled = state.draft.isNotBlank() && !state.posting,
                ) {
                    if (state.posting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("Đăng bài")
                }
            }
        }
    }
}

@Composable
private fun PostCard(post: FeedPostDto, state: FeedUiState, vm: FeedViewModel) {
    val postId = post.id ?: return
    val expanded = state.expandedPostId == postId
    HrmCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.animateContentSize()) {
            // Đầu thẻ: tác giả + thời gian + menu
            Row(verticalAlignment = Alignment.CenterVertically) {
                InitialAvatar(name = post.authorName, sizeDp = 42)
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = post.authorName ?: "Người dùng",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (post.isPinned == true) {
                            Spacer(Modifier.width(8.dp))
                            StatusChip(
                                text = "Đã ghim",
                                bg = Color(0xFFFEF0C7),
                                fg = WarningAmber,
                            )
                        }
                    }
                    val meta = listOfNotNull(
                        post.authorDepartment,
                        relativeTimeVi(post.createdAt).takeIf { it.isNotBlank() },
                    ).joinToString(" · ")
                    if (meta.isNotBlank()) {
                        Text(
                            text = meta,
                            style = MaterialTheme.typography.bodySmall,
                            color = InkMuted,
                        )
                    }
                }
                if (post.canDelete == true) {
                    var menuOpen by remember { mutableStateOf(false) }
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(
                                Icons.Filled.MoreVert,
                                contentDescription = "Tuỳ chọn bài viết",
                                tint = InkMuted,
                            )
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text("Xoá bài viết", color = DangerRed) },
                                leadingIcon = {
                                    Icon(Icons.Outlined.Delete, contentDescription = null, tint = DangerRed)
                                },
                                onClick = {
                                    menuOpen = false
                                    vm.requestDeletePost(post)
                                },
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            Text(
                text = post.content ?: "",
                style = MaterialTheme.typography.bodyLarge,
            )

            Spacer(Modifier.height(8.dp))
            // Hàng hành động: thả tim + bình luận
            Row(verticalAlignment = Alignment.CenterVertically) {
                LikeButton(post = post, onClick = { vm.toggleLike(post) })
                Spacer(Modifier.width(8.dp))
                Row(
                    modifier = Modifier
                        .clip(CircleShape)
                        .clickable { vm.toggleComments(post) }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Outlined.ModeComment,
                        contentDescription = "Bình luận",
                        tint = if (expanded) BrandBlue else InkMuted,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "${post.commentCount ?: 0} bình luận",
                        style = MaterialTheme.typography.labelLarge,
                        color = if (expanded) BrandBlue else InkMuted,
                    )
                }
            }

            AnimatedVisibility(visible = expanded) {
                CommentsSection(postId = postId, state = state, vm = vm)
            }
        }
    }
}

@Composable
private fun LikeButton(post: FeedPostDto, onClick: () -> Unit) {
    val liked = post.likedByMe == true
    val scaleAnim = remember { Animatable(1f) }
    LaunchedEffect(liked) {
        if (liked) {
            scaleAnim.animateTo(1.35f, animationSpec = tween(120))
            scaleAnim.animateTo(
                1f,
                animationSpec = spring(dampingRatio = 0.45f, stiffness = 400f),
            )
        }
    }
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .clickable { onClick() }
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (liked) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
            contentDescription = "Thả tim",
            tint = if (liked) DangerRed else InkMuted,
            modifier = Modifier.size(20.dp).scale(scaleAnim.value),
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = "${post.likeCount ?: 0}",
            style = MaterialTheme.typography.labelLarge,
            color = if (liked) DangerRed else InkMuted,
            fontWeight = if (liked) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun CommentsSection(postId: Int, state: FeedUiState, vm: FeedViewModel) {
    val comments = state.comments[postId]
    val loadingComments = state.commentsLoading.contains(postId)
    Column(modifier = Modifier.padding(top = 8.dp)) {
        Box(
            modifier = Modifier.fillMaxWidth().height(1.dp).background(BrandBlueSoft),
        )
        Spacer(Modifier.height(10.dp))
        when {
            loadingComments && comments == null -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = BrandBlue,
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "Đang tải bình luận…",
                        style = MaterialTheme.typography.bodySmall,
                        color = InkMuted,
                    )
                }
            }
            comments.isNullOrEmpty() -> {
                Text(
                    text = "Chưa có bình luận nào. Hãy bình luận đầu tiên nhé!",
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
            }
            else -> {
                comments.forEach { comment ->
                    CommentRow(
                        comment = comment,
                        onDelete = { vm.requestDeleteComment(comment) },
                    )
                    Spacer(Modifier.height(10.dp))
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = state.commentDrafts[postId] ?: "",
                onValueChange = { vm.onCommentDraftChange(postId, it) },
                placeholder = { Text("Viết bình luận…") },
                maxLines = 3,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            val sending = state.commentSending.contains(postId)
            IconButton(
                onClick = { vm.submitComment(postId) },
                enabled = !sending && (state.commentDrafts[postId] ?: "").isNotBlank(),
            ) {
                if (sending) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = BrandBlue,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(
                        Icons.AutoMirrored.Outlined.Send,
                        contentDescription = "Gửi bình luận",
                        tint = BrandBlue,
                    )
                }
            }
        }
    }
}

@Composable
private fun CommentRow(comment: FeedCommentDto, onDelete: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth()) {
        InitialAvatar(name = comment.authorName, sizeDp = 30)
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = comment.authorName ?: "Người dùng",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = relativeTimeVi(comment.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = InkMuted,
                )
                if (comment.canDelete == true) {
                    Spacer(Modifier.weight(1f))
                    IconButton(
                        onClick = onDelete,
                        modifier = Modifier.size(40.dp),
                    ) {
                        Icon(
                            Icons.Outlined.Delete,
                            contentDescription = "Xoá bình luận",
                            tint = InkMuted,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }
            Text(
                text = comment.content ?: "",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
