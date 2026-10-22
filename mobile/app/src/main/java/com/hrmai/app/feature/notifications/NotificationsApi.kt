package com.hrmai.app.feature.notifications

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

// Shape khớp server/app/blueprints/notifications/routes.py — serialize
// camelCase: id, type, title, content, isRead, relatedType, relatedId,
// createdAt. GET trả { data: [...], meta: {...}, unreadCount: n }.
// PATCH /{id}/read trả { notification: {...}, unreadCount: n } (không bọc data).

@JsonClass(generateAdapter = false)
data class NotificationDto(
    val id: Int? = null,
    val type: String? = null,
    val title: String? = null,
    val content: String? = null,
    @Json(name = "isRead") val isRead: Boolean? = null,
    @Json(name = "relatedType") val relatedType: String? = null,
    @Json(name = "relatedId") val relatedId: Int? = null,
    @Json(name = "createdAt") val createdAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class NotificationsResponse(
    val data: List<NotificationDto>? = null,
    @Json(name = "unreadCount") val unreadCount: Int? = null,
)

@JsonClass(generateAdapter = false)
data class MarkReadResponse(
    val notification: NotificationDto? = null,
    @Json(name = "unreadCount") val unreadCount: Int? = null,
)

interface NotificationsApi {
    @GET("notifications")
    suspend fun getNotifications(@Query("limit") limit: Int = 100): NotificationsResponse

    @PATCH("notifications/{id}/read")
    suspend fun markRead(@Path("id") id: Int): MarkReadResponse

    @POST("notifications/read-all")
    suspend fun markAllRead(): Response<Unit>
}
