package com.hrmai.app.core.util

import java.text.NumberFormat
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Định dạng ngày giờ/tiền theo giờ Việt Nam (Asia/Ho_Chi_Minh). */
object Format {
    val ICT: ZoneId = ZoneId.of("Asia/Ho_Chi_Minh")
    private val dateFmt = DateTimeFormatter.ofPattern("dd/MM/yyyy")
    private val timeFmt = DateTimeFormatter.ofPattern("HH:mm")
    private val dateTimeFmt = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy")
    private val moneyFmt = NumberFormat.getInstance(Locale("vi", "VN"))

    /** Parse chuỗi ngày/giờ từ API (ISO date, ISO datetime, có/không offset). */
    fun parseDateTime(raw: String?): LocalDateTime? {
        if (raw.isNullOrBlank()) return null
        val text = raw.trim()
        runCatching { return OffsetDateTime.parse(text).atZoneSameInstant(ICT).toLocalDateTime() }
        runCatching { return LocalDateTime.parse(text) }
        runCatching { return LocalDate.parse(text).atStartOfDay() }
        // Dạng "yyyy-MM-dd HH:mm:ss"
        runCatching {
            return LocalDateTime.parse(text.replace(" ", "T"))
        }
        return null
    }

    fun parseDate(raw: String?): LocalDate? {
        if (raw.isNullOrBlank()) return null
        runCatching { return LocalDate.parse(raw.trim().take(10)) }
        return parseDateTime(raw)?.toLocalDate()
    }

    fun date(raw: String?): String = parseDate(raw)?.format(dateFmt) ?: (raw ?: "—")
    fun time(raw: String?): String = parseDateTime(raw)?.format(timeFmt) ?: "—"
    fun dateTime(raw: String?): String = parseDateTime(raw)?.format(dateTimeFmt) ?: (raw ?: "—")
    fun dateOf(dt: LocalDate?): String = dt?.format(dateFmt) ?: "—"

    fun money(value: Long?): String =
        if (value == null) "—" else "${moneyFmt.format(value)}đ"

    fun money(value: Double?): String =
        if (value == null) "—" else "${moneyFmt.format(value.toLong())}đ"

    fun greeting(now: LocalDateTime = LocalDateTime.now(ICT)): String = when (now.hour) {
        in 5..10 -> "Chào buổi sáng"
        in 11..12 -> "Chào buổi trưa"
        in 13..17 -> "Chào buổi chiều"
        in 18..22 -> "Chào buổi tối"
        else -> "Chào bạn"
    }

    /** "23/10/2026" -> nhãn tháng "Tháng 10/2026" cho LocalDate. */
    fun monthLabel(date: LocalDate): String = "Tháng ${date.monthValue}/${date.year}"

    fun today(): LocalDate = LocalDate.now(ICT)
    fun now(): LocalDateTime = LocalDateTime.now(ICT)
}
