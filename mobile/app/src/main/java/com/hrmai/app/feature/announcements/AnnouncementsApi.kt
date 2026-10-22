package com.hrmai.app.feature.announcements

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.GET

// Shape khớp server/app/blueprints/announcements/schemas.py — module này
// serialize theo camelCase: id, title, content, category, isPinned,
// authorId, authorName, createdAt, updatedAt. Danh sách bọc { data, meta }
// (ghim trước, mới nhất sau — server đã sắp xếp sẵn).

@JsonClass(generateAdapter = false)
data class AnnouncementDto(
    val id: Int? = null,
    val title: String? = null,
    val content: String? = null,
    val category: String? = null,
    @Json(name = "isPinned") val isPinned: Boolean? = null,
    @Json(name = "authorId") val authorId: Int? = null,
    @Json(name = "authorName") val authorName: String? = null,
    @Json(name = "createdAt") val createdAt: String? = null,
    @Json(name = "updatedAt") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class AnnouncementsResponse(
    val data: List<AnnouncementDto>? = null,
)

/** Nhãn + ý nghĩa loại thông báo — khớp CATEGORY_META của bản web. */
object AnnouncementCategories {
    fun labelOf(category: String?): String = when (category) {
        "policy" -> "Chính sách"
        "event" -> "Sự kiện"
        else -> "Chung"
    }
}

interface AnnouncementsApi {
    @GET("announcements")
    suspend fun getAnnouncements(): AnnouncementsResponse
}
