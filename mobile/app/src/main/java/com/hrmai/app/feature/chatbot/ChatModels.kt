package com.hrmai.app.feature.chatbot

/** Một nguồn trích dẫn hiển thị dưới câu trả lời của chatbot. */
data class ChatSource(
    val title: String,
    val page: Int? = null,
    val excerpt: String = "",
)

/** 1 dòng chi tiết trên thẻ hành động (nhãn + giá trị, do server soạn sẵn). */
data class ActionDetail(
    val label: String,
    val value: String,
)

/**
 * Thẻ hành động chatbot ĐỀ XUẤT (mode = "action"). ask chỉ đề xuất,
 * không thay đổi dữ liệu — thực thi qua POST chat/actions/execute sau
 * khi người dùng bấm xác nhận.
 * [payloadJson]: payload gốc dạng chuỗi JSON, giữ nguyên để gửi lại
 * nguyên vẹn khi execute (server kiểm tra lại toàn bộ ở tầng leave).
 */
data class ChatAction(
    val type: String,
    val title: String,
    val summary: String = "",
    val details: List<ActionDetail> = emptyList(),
    val payloadJson: String = "{}",
) {
    /** Tiêu đề dự phòng theo type khi server không gửi title. */
    val displayTitle: String
        get() = title.ifBlank {
            when (type) {
                "create_leave" -> "Soạn đơn nghỉ phép"
                "decide_leave" -> "Duyệt đơn nghỉ phép"
                else -> "Hành động chờ xác nhận"
            }
        }
}

/** Trạng thái vòng đời của 1 thẻ hành động trong luồng chat. */
enum class ActionStatus {
    /** Mới đề xuất, chờ người dùng xác nhận/huỷ. */
    PENDING,

    /** Đang gọi execute. */
    EXECUTING,

    /** Đã thực hiện xong (nút khoá). */
    DONE,

    /** Đã bấm xác nhận nhưng server từ chối (nút khoá, lỗi hiện trên thẻ). */
    FAILED,

    /** Người dùng đã huỷ (nút khoá, không gọi API). */
    CANCELLED,

    /** Khôi phục từ lịch sử — chỉ đọc, không thực thi lại. */
    HISTORY,
}

/** 1 tin nhắn trong luồng hội thoại. */
data class ChatMessage(
    val id: String,
    val fromUser: Boolean,
    val text: String = "",
    val sources: List<ChatSource> = emptyList(),
    /** "live_data" | "rag" | "action" (chỉ với tin của chatbot). */
    val mode: String? = null,
    /** Chế độ truy hồi chi tiết của luồng RAG (hybrid_rerank/hybrid/…). */
    val retrievalMode: String? = null,
    val action: ChatAction? = null,
    val actionStatus: ActionStatus? = null,
    /** Lỗi nghiệp vụ của execute — hiện nguyên văn message server trên thẻ. */
    val actionError: String? = null,
    /** Tin lỗi khi gửi câu hỏi thất bại (bong bóng đỏ + nút thử lại). */
    val isError: Boolean = false,
    /** Bong bóng "đang soạn…" chờ response của ask. */
    val isTyping: Boolean = false,
    /** Chuỗi thời gian gốc từ server (ISO) để Format hiển thị. */
    val createdAt: String? = null,
)

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val historyLoading: Boolean = true,
    /** Lỗi khi tải lịch sử trò chuyện (hiện ErrorState + nút tải lại). */
    val historyError: String? = null,
    val sending: Boolean = false,
    /** Câu hỏi gửi gần nhất bị lỗi — phục vụ nút "Thử lại". */
    val lastFailedQuestion: String? = null,
)
