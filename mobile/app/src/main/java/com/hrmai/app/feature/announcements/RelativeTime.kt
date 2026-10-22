package com.hrmai.app.feature.announcements

import com.hrmai.app.core.util.Format
import java.time.Duration

/** Thời gian tương đối kiểu "Vừa xong" / "5 phút trước" / "Hôm qua" (theo giờ VN). */
internal fun relativeTimeVi(raw: String?): String {
    val dt = Format.parseDateTime(raw) ?: return ""
    val seconds = Duration.between(dt, Format.now()).seconds
    if (seconds < 60) return "Vừa xong"
    val minutes = seconds / 60
    if (minutes < 60) return "$minutes phút trước"
    val hours = minutes / 60
    if (hours < 24) return "$hours giờ trước"
    val days = hours / 24
    if (days == 1L) return "Hôm qua"
    if (days < 30) return "$days ngày trước"
    return Format.dateOf(dt.toLocalDate())
}
