package com.hrmai.app.feature.feed

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

// DTO khớp server/app/blueprints/feed/schemas.py:
// - Bài: id, content, is_pinned, like_count, comment_count, liked_by_me,
//   comments_preview, created_at, updated_at + khối tác giả author_*,
//   can_delete, can_pin.
// - Bình luận: id, post_id, content, created_at + author_*, can_delete.
// Mọi phản hồi đều bọc trong { data: ... , meta: ... }.

@JsonClass(generateAdapter = false)
data class FeedCommentDto(
    val id: Int? = null,
    @Json(name = "post_id") val postId: Int? = null,
    val content: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "author_id") val authorId: Int? = null,
    @Json(name = "author_name") val authorName: String? = null,
    @Json(name = "author_code") val authorCode: String? = null,
    @Json(name = "author_department") val authorDepartment: String? = null,
    @Json(name = "can_delete") val canDelete: Boolean? = null,
)

@JsonClass(generateAdapter = false)
data class FeedPostDto(
    val id: Int? = null,
    val content: String? = null,
    @Json(name = "is_pinned") val isPinned: Boolean? = null,
    @Json(name = "like_count") val likeCount: Int? = null,
    @Json(name = "comment_count") val commentCount: Int? = null,
    @Json(name = "liked_by_me") val likedByMe: Boolean? = null,
    @Json(name = "comments_preview") val commentsPreview: List<FeedCommentDto>? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "updated_at") val updatedAt: String? = null,
    @Json(name = "author_id") val authorId: Int? = null,
    @Json(name = "author_name") val authorName: String? = null,
    @Json(name = "author_code") val authorCode: String? = null,
    @Json(name = "author_department") val authorDepartment: String? = null,
    @Json(name = "can_delete") val canDelete: Boolean? = null,
    @Json(name = "can_pin") val canPin: Boolean? = null,
)

@JsonClass(generateAdapter = false)
data class FeedPostsResponse(
    val data: List<FeedPostDto>? = null,
)

@JsonClass(generateAdapter = false)
data class FeedPostResponse(
    val data: FeedPostDto? = null,
)

@JsonClass(generateAdapter = false)
data class FeedCommentsResponse(
    val data: List<FeedCommentDto>? = null,
)

@JsonClass(generateAdapter = false)
data class FeedCommentResponse(
    val data: FeedCommentDto? = null,
)

@JsonClass(generateAdapter = false)
data class LikeResultDto(
    @Json(name = "post_id") val postId: Int? = null,
    val liked: Boolean? = null,
    @Json(name = "like_count") val likeCount: Int? = null,
)

@JsonClass(generateAdapter = false)
data class LikeResultResponse(
    val data: LikeResultDto? = null,
)

@JsonClass(generateAdapter = false)
data class CreatePostRequest(
    val content: String,
)

@JsonClass(generateAdapter = false)
data class CreateCommentRequest(
    val content: String,
)

interface FeedApi {
    @GET("feed/posts")
    suspend fun getPosts(): FeedPostsResponse

    @POST("feed/posts")
    suspend fun createPost(@Body body: CreatePostRequest): FeedPostResponse

    @DELETE("feed/posts/{id}")
    suspend fun deletePost(@Path("id") id: Int): Response<Unit>

    @POST("feed/posts/{id}/like")
    suspend fun toggleLike(@Path("id") id: Int): LikeResultResponse

    @GET("feed/posts/{postId}/comments")
    suspend fun getComments(@Path("postId") postId: Int): FeedCommentsResponse

    @POST("feed/posts/{postId}/comments")
    suspend fun createComment(
        @Path("postId") postId: Int,
        @Body body: CreateCommentRequest,
    ): FeedCommentResponse

    @DELETE("feed/comments/{id}")
    suspend fun deleteComment(@Path("id") id: Int): Response<Unit>
}
