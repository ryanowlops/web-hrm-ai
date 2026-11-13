package com.hrmai.app.core.util

import java.text.Normalizer

/**
 * Bỏ dấu tiếng Việt + hạ chữ thường để tìm kiếm khớp cả khi gõ có dấu
 * lẫn không dấu ("nghi phep" khớp "Nghỉ phép", và ngược lại).
 * Cùng logic với stripDiacritics() bên web (client/src/layouts/AppLayout.jsx):
 * NFD tách dấu khỏi chữ gốc rồi xóa dấu kết hợp; riêng đ/Đ không tách
 * được bằng NFD nên thay tay. java.text.Normalizer có sẵn trên Android.
 */
fun String.stripDiacritics(): String =
    Normalizer.normalize(lowercase(), Normalizer.Form.NFD)
        .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
        .replace('đ', 'd')
