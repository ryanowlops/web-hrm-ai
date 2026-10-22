package com.hrmai.app.feature.chatbot

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/**
 * ViewModel Chatbot HR.
 * - Mở màn: tải lịch sử (GET chat/history) và khôi phục các cặp hỏi/đáp;
 *   thẻ hành động trong lịch sử ở trạng thái HISTORY (chỉ đọc).
 * - Gửi hỏi: POST chat/ask { question } — response TOP LEVEL
 *   { answer, sources, mode, retrieval_mode, action }.
 * - Thẻ hành động: xác nhận -> POST chat/actions/execute { type, payload };
 *   thẻ chỉ thao tác được MỘT lần (xác nhận hoặc huỷ đều khoá nút).
 */
class ChatViewModel(
    private val api: ChatApi,
    @Suppress("unused") private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state

    private var seq = 0
    private fun nextId(prefix: String): String = "$prefix-${System.currentTimeMillis()}-${seq++}"

    init {
        loadHistory()
    }

    /* ------------------------------- Lịch sử ------------------------------- */

    fun loadHistory() {
        _state.update { it.copy(historyLoading = true) }
        viewModelScope.launch {
            runCatching {
                val raw = api.history(page = 1, limit = 30).string()
                parseHistory(raw)
            }.onSuccess { restored ->
                _state.update { it.copy(messages = restored, historyLoading = false) }
            }.onFailure {
                // Không tải được lịch sử không chặn việc chat mới (như bản web).
                _state.update { it.copy(historyLoading = false) }
            }
        }
    }

    /** Bóc { data: [...] } -> danh sách tin nhắn theo thời gian tăng dần. */
    private fun parseHistory(raw: String): List<ChatMessage> {
        val root = JSONObject(raw)
        val items: JSONArray = root.optJSONArray("data") ?: JSONArray()
        val logs = mutableListOf<JSONObject>()
        for (i in 0 until items.length()) logs.add(items.getJSONObject(i))
        // Server trả mới nhất trước — sắp xếp lại tăng dần như bản web.
        logs.sortBy { it.optString("createdAt").ifBlank { it.optString("created_at") } }
        val out = mutableListOf<ChatMessage>()
        logs.forEachIndexed { i, log ->
            val id = if (log.has("id")) log.opt("id").toString() else i.toString()
            val createdAt = log.optString("createdAt")
                .ifBlank { log.optString("created_at") }.takeIf { it.isNotBlank() }
            out.add(
                ChatMessage(
                    id = "h-$id-q",
                    fromUser = true,
                    text = log.optString("question"),
                    createdAt = createdAt,
                ),
            )
            val action = parseAction(log.optJSONObject("action"))
            out.add(
                ChatMessage(
                    id = "h-$id-a",
                    fromUser = false,
                    text = log.optString("answer"),
                    sources = parseSources(log.optJSONArray("sources")),
                    mode = log.optString("mode").takeIf { it.isNotBlank() },
                    action = action,
                    actionStatus = if (action != null) ActionStatus.HISTORY else null,
                    createdAt = createdAt,
                ),
            )
        }
        return out
    }

    /* -------------------------------- Gửi hỏi ------------------------------ */

    fun send(rawQuestion: String) {
        val question = rawQuestion.trim()
        if (question.isEmpty() || _state.value.sending) return
        val now = Instant.now().toString()
        val userMsg = ChatMessage(id = nextId("u"), fromUser = true, text = question, createdAt = now)
        val typingId = nextId("t")
        _state.update {
            it.copy(
                messages = it.messages + userMsg +
                    ChatMessage(id = typingId, fromUser = false, isTyping = true, createdAt = now),
                sending = true,
                lastFailedQuestion = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                val raw = api.ask(AskRequest(question)).string()
                parseAsk(raw)
            }.onSuccess { parsed ->
                _state.update { s ->
                    s.copy(
                        messages = s.messages.map { m ->
                            if (m.id == typingId) {
                                m.copy(
                                    isTyping = false,
                                    text = parsed.answer.ifBlank {
                                        "Chatbot chưa trả về nội dung, vui lòng thử lại."
                                    },
                                    sources = parsed.sources,
                                    mode = parsed.mode,
                                    retrievalMode = parsed.retrievalMode,
                                    action = parsed.action,
                                    actionStatus = if (parsed.action != null) {
                                        ActionStatus.PENDING
                                    } else {
                                        null
                                    },
                                )
                            } else {
                                m
                            }
                        },
                        sending = false,
                    )
                }
            }.onFailure { e ->
                val message = e.toApiException().message
                _state.update { s ->
                    s.copy(
                        messages = s.messages.map { m ->
                            if (m.id == typingId) {
                                m.copy(isTyping = false, isError = true, text = message)
                            } else {
                                m
                            }
                        },
                        sending = false,
                        lastFailedQuestion = question,
                    )
                }
            }
        }
    }

    /** Thử lại câu hỏi gần nhất bị lỗi gửi (xoá bong bóng lỗi cũ rồi gửi lại). */
    fun retryLast() {
        val question = _state.value.lastFailedQuestion ?: return
        _state.update { s ->
            s.copy(messages = s.messages.filterNot { it.isError })
        }
        send(question)
    }

    private data class AskResult(
        val answer: String,
        val sources: List<ChatSource>,
        val mode: String?,
        val retrievalMode: String?,
        val action: ChatAction?,
    )

    /** Bóc response ask: chấp nhận cả dạng top-level lẫn bọc trong "data". */
    private fun parseAsk(raw: String): AskResult {
        val root = JSONObject(raw)
        val payload = root.optJSONObject("data") ?: root
        var mode = payload.optString("mode").takeIf { it.isNotBlank() } ?: "rag"
        var retrievalMode = payload.optString("retrieval_mode").takeIf { it.isNotBlank() }
        // Tương thích ngược (như web): response cũ trả mode là chế độ truy hồi.
        if (mode in RETRIEVAL_MODES) {
            retrievalMode = retrievalMode ?: mode
            mode = "rag"
        }
        return AskResult(
            answer = payload.optString("answer"),
            sources = parseSources(payload.optJSONArray("sources")),
            mode = mode,
            retrievalMode = retrievalMode,
            action = parseAction(payload.optJSONObject("action")),
        )
    }

    /* ----------------------------- Thẻ hành động ---------------------------- */

    /** Xác nhận: thực thi hành động. Thẻ khoá ngay sau lần thao tác này. */
    fun confirmAction(messageId: String) {
        val msg = _state.value.messages.firstOrNull { it.id == messageId } ?: return
        val action = msg.action ?: return
        if (msg.actionStatus != ActionStatus.PENDING) return
        _state.update { s ->
            s.copy(
                messages = s.messages.map { m ->
                    if (m.id == messageId) {
                        m.copy(actionStatus = ActionStatus.EXECUTING, actionError = null)
                    } else {
                        m
                    }
                },
            )
        }
        viewModelScope.launch {
            runCatching {
                val body = JSONObject()
                    .put("type", action.type)
                    .put("payload", JSONObject(action.payloadJson))
                    .toString()
                    .toRequestBody(JSON_MEDIA_TYPE)
                val raw = api.executeAction(body).string()
                val root = JSONObject(raw)
                val payload = root.optJSONObject("data") ?: root
                payload.optString("result_text")
            }.onSuccess { resultText ->
                _state.update { s ->
                    s.copy(
                        messages = s.messages.map { m ->
                            if (m.id == messageId) {
                                m.copy(actionStatus = ActionStatus.DONE, actionError = null)
                            } else {
                                m
                            }
                        } + ChatMessage(
                            id = nextId("r"),
                            fromUser = false,
                            text = resultText.ifBlank { "Đã thực hiện xong hành động." },
                            createdAt = Instant.now().toString(),
                        ),
                    )
                }
            }.onFailure { e ->
                // Hiện nguyên văn message lỗi của server (vd trùng đơn 409,
                // không đủ phép) ngay trên thẻ; thẻ đã khoá — muốn làm lại
                // thì nhắn lại yêu cầu để chatbot soạn thẻ mới.
                val message = e.toApiException().message
                _state.update { s ->
                    s.copy(
                        messages = s.messages.map { m ->
                            if (m.id == messageId) {
                                m.copy(actionStatus = ActionStatus.FAILED, actionError = message)
                            } else {
                                m
                            }
                        },
                    )
                }
            }
        }
    }

    /** Huỷ thẻ: chỉ đổi trạng thái ở client, không gọi API. */
    fun cancelAction(messageId: String) {
        _state.update { s ->
            s.copy(
                messages = s.messages.map { m ->
                    if (m.id == messageId && m.actionStatus == ActionStatus.PENDING) {
                        m.copy(actionStatus = ActionStatus.CANCELLED, actionError = null)
                    } else {
                        m
                    }
                },
            )
        }
    }

    /* ------------------------------ Bóc JSON ------------------------------- */

    private fun parseSources(array: JSONArray?): List<ChatSource> {
        if (array == null) return emptyList()
        val out = mutableListOf<ChatSource>()
        for (i in 0 until array.length()) {
            val s = array.optJSONObject(i) ?: continue
            val title = s.optString("document_title").ifBlank { s.optString("title") }
                .ifBlank { s.optString("document") }.ifBlank { "Tài liệu nội bộ" }
            val page = when {
                s.has("page_no") && !s.isNull("page_no") -> s.optInt("page_no")
                s.has("page") && !s.isNull("page") -> s.optInt("page")
                else -> null
            }
            val excerpt = s.optString("chunk_text").ifBlank { s.optString("excerpt") }
                .ifBlank { s.optString("text") }
            out.add(ChatSource(title = title, page = page, excerpt = excerpt))
        }
        return out
    }

    private fun parseAction(obj: JSONObject?): ChatAction? {
        if (obj == null) return null
        val type = obj.optString("type").takeIf { it.isNotBlank() } ?: return null
        val details = mutableListOf<ActionDetail>()
        val arr = obj.optJSONArray("details")
        if (arr != null) {
            for (i in 0 until arr.length()) {
                val d = arr.optJSONObject(i) ?: continue
                details.add(ActionDetail(d.optString("label"), d.optString("value")))
            }
        }
        val payload = obj.optJSONObject("payload")
        return ChatAction(
            type = type,
            title = obj.optString("title"),
            summary = obj.optString("summary"),
            details = details,
            payloadJson = payload?.toString() ?: "{}",
        )
    }

    class Factory(
        private val api: ChatApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ChatViewModel(api, sessionStore) as T
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        private val RETRIEVAL_MODES = setOf("hybrid_rerank", "hybrid", "embedding", "keyword", "none")
    }
}
