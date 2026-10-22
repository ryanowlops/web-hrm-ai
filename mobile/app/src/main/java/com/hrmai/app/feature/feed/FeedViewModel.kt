package com.hrmai.app.feature.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FeedUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val posts: List<FeedPostDto> = emptyList(),
    val error: String? = null,
    val draft: String = "",
    val posting: Boolean = false,
    val expandedPostId: Int? = null,
    val comments: Map<Int, List<FeedCommentDto>> = emptyMap(),
    val commentsLoading: Set<Int> = emptySet(),
    val commentDrafts: Map<Int, String> = emptyMap(),
    val commentSending: Set<Int> = emptySet(),
    val deletePostTarget: FeedPostDto? = null,
    val deleteCommentTarget: FeedCommentDto? = null,
    val toast: String? = null,
)

class FeedViewModel(
    private val api: FeedApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { api.getPosts() }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            loading = false,
                            posts = resp.data ?: emptyList(),
                            error = null,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(loading = false, error = e.toApiException().message)
                    }
                }
        }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        _state.update { it.copy(refreshing = true) }
        viewModelScope.launch {
            runCatching { api.getPosts() }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(refreshing = false, posts = resp.data ?: emptyList())
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(refreshing = false, toast = e.toApiException().message)
                    }
                }
        }
    }

    fun onDraftChange(value: String) = _state.update { it.copy(draft = value) }

    fun submitPost() {
        val s = _state.value
        val content = s.draft.trim()
        if (content.isBlank() || s.posting) return
        _state.update { it.copy(posting = true) }
        viewModelScope.launch {
            runCatching { api.createPost(CreatePostRequest(content)) }
                .onSuccess { resp ->
                    val created = resp.data
                    _state.update {
                        it.copy(
                            posting = false,
                            draft = "",
                            posts = if (created != null) listOf(created) + it.posts else it.posts,
                            toast = "Đã đăng bài lên bảng tin",
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(posting = false, toast = e.toApiException().message)
                    }
                }
        }
    }

    /**
     * Thả tim kiểu lạc quan: đổi ngay trên UI, gọi server rồi chốt theo
     * kết quả thật (liked/like_count); lỗi thì hoàn lại trạng thái cũ.
     */
    fun toggleLike(post: FeedPostDto) {
        val id = post.id ?: return
        val before = _state.value.posts.firstOrNull { it.id == id } ?: return
        val wasLiked = before.likedByMe == true
        val optimistic = before.copy(
            likedByMe = !wasLiked,
            likeCount = ((before.likeCount ?: 0) + if (wasLiked) -1 else 1).coerceAtLeast(0),
        )
        replacePost(optimistic)
        viewModelScope.launch {
            runCatching { api.toggleLike(id) }
                .onSuccess { resp ->
                    val result = resp.data ?: return@onSuccess
                    val current = _state.value.posts.firstOrNull { it.id == id }
                        ?: return@onSuccess
                    replacePost(
                        current.copy(
                            likedByMe = result.liked ?: current.likedByMe,
                            likeCount = result.likeCount ?: current.likeCount,
                        )
                    )
                }
                .onFailure { e ->
                    replacePost(before)
                    _state.update { it.copy(toast = e.toApiException().message) }
                }
        }
    }

    fun toggleComments(post: FeedPostDto) {
        val id = post.id ?: return
        val expanded = _state.value.expandedPostId == id
        _state.update { it.copy(expandedPostId = if (expanded) null else id) }
        if (!expanded && _state.value.comments[id] == null) {
            loadComments(id)
        }
    }

    fun loadComments(postId: Int) {
        if (_state.value.commentsLoading.contains(postId)) return
        _state.update { it.copy(commentsLoading = it.commentsLoading + postId) }
        viewModelScope.launch {
            runCatching { api.getComments(postId) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            commentsLoading = it.commentsLoading - postId,
                            comments = it.comments + (postId to (resp.data ?: emptyList())),
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            commentsLoading = it.commentsLoading - postId,
                            toast = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun onCommentDraftChange(postId: Int, value: String) {
        _state.update { it.copy(commentDrafts = it.commentDrafts + (postId to value)) }
    }

    fun submitComment(postId: Int) {
        val s = _state.value
        val content = (s.commentDrafts[postId] ?: "").trim()
        if (content.isBlank() || s.commentSending.contains(postId)) return
        _state.update { it.copy(commentSending = it.commentSending + postId) }
        viewModelScope.launch {
            runCatching { api.createComment(postId, CreateCommentRequest(content)) }
                .onSuccess { resp ->
                    val created = resp.data
                    _state.update { st ->
                        val list = st.comments[postId] ?: emptyList()
                        val newComments = if (created != null) {
                            st.comments + (postId to (listOf(created) + list))
                        } else {
                            st.comments
                        }
                        val newPosts = st.posts.map { p ->
                            if (p.id == postId) {
                                p.copy(commentCount = (p.commentCount ?: 0) + 1)
                            } else {
                                p
                            }
                        }
                        st.copy(
                            commentSending = st.commentSending - postId,
                            commentDrafts = st.commentDrafts + (postId to ""),
                            comments = newComments,
                            posts = newPosts,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            commentSending = it.commentSending - postId,
                            toast = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun requestDeletePost(post: FeedPostDto) =
        _state.update { it.copy(deletePostTarget = post) }

    fun cancelDeletePost() = _state.update { it.copy(deletePostTarget = null) }

    fun confirmDeletePost() {
        val target = _state.value.deletePostTarget ?: return
        val id = target.id ?: return
        _state.update { it.copy(deletePostTarget = null) }
        viewModelScope.launch {
            runCatching { api.deletePost(id) }
                .onSuccess {
                    _state.update { st ->
                        st.copy(
                            posts = st.posts.filterNot { p -> p.id == id },
                            comments = st.comments - id,
                            expandedPostId = if (st.expandedPostId == id) null else st.expandedPostId,
                            toast = "Đã xoá bài viết",
                        )
                    }
                }
                .onFailure { e ->
                    _state.update { it.copy(toast = e.toApiException().message) }
                }
        }
    }

    fun requestDeleteComment(comment: FeedCommentDto) =
        _state.update { it.copy(deleteCommentTarget = comment) }

    fun cancelDeleteComment() = _state.update { it.copy(deleteCommentTarget = null) }

    fun confirmDeleteComment() {
        val target = _state.value.deleteCommentTarget ?: return
        val commentId = target.id ?: return
        val postId = target.postId
        _state.update { it.copy(deleteCommentTarget = null) }
        viewModelScope.launch {
            runCatching { api.deleteComment(commentId) }
                .onSuccess {
                    _state.update { st ->
                        val newComments = if (postId != null) {
                            val list = st.comments[postId] ?: emptyList()
                            st.comments + (postId to list.filterNot { c -> c.id == commentId })
                        } else {
                            st.comments
                        }
                        val newPosts = if (postId != null) {
                            st.posts.map { p ->
                                if (p.id == postId) {
                                    p.copy(
                                        commentCount = ((p.commentCount ?: 0) - 1)
                                            .coerceAtLeast(0)
                                    )
                                } else {
                                    p
                                }
                            }
                        } else {
                            st.posts
                        }
                        st.copy(
                            comments = newComments,
                            posts = newPosts,
                            toast = "Đã xoá bình luận",
                        )
                    }
                }
                .onFailure { e ->
                    _state.update { it.copy(toast = e.toApiException().message) }
                }
        }
    }

    fun consumeToast() = _state.update { it.copy(toast = null) }

    private fun replacePost(post: FeedPostDto) {
        _state.update { st ->
            st.copy(posts = st.posts.map { p -> if (p.id == post.id) post else p })
        }
    }

    class Factory(
        private val api: FeedApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            FeedViewModel(api, sessionStore) as T
    }
}
