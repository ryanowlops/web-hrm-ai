package com.hrmai.app.feature.recruitment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// Bộ câu hỏi phỏng vấn AI của MỘT tin tuyển dụng (jobId cố định theo màn).
// - load(): GET kit; 404 -> noKit (hiện nút "Tạo bằng AI"), 403 -> forbidden.
// - generate(): POST generate — AI có thể mất 10–30 giây nên cờ generating
//   riêng để UI hiện trạng thái chờ rõ ràng; thành công thì thay kit mới.
// - updateQuestion(): sửa 1 câu rồi PUT CẢ BỘ (server validate + chuẩn hoá
//   lại trọng số, giữ nguyên version và nhãn nguồn).
// ---------------------------------------------------------------------------

data class InterviewKitUiState(
    val kit: InterviewKitDto? = null,
    val loading: Boolean = true,
    /** 404: tin này chưa có bộ câu hỏi. */
    val noKit: Boolean = false,
    /** 403: chỉ admin/hr mới dùng được bộ câu hỏi. */
    val forbidden: Boolean = false,
    val error: String? = null,
    /** Đang sinh/tái tạo bằng AI (có thể 10–30 giây). */
    val generating: Boolean = false,
    /** Đang lưu bản sửa tay. */
    val saving: Boolean = false,
    /** Thông điệp một lần (thành công/lỗi thao tác) hiển thị trong section. */
    val message: String? = null,
    val messageIsError: Boolean = false,
)

class InterviewKitViewModel(
    private val api: InterviewKitApi,
    @Suppress("unused") private val sessionStore: SessionStore,
    private val jobId: Int,
) : ViewModel() {

    private val _state = MutableStateFlow(InterviewKitUiState())
    val state: StateFlow<InterviewKitUiState> = _state

    init {
        load()
    }

    fun load() {
        if (_state.value.generating) return
        viewModelScope.launch {
            _state.update {
                it.copy(loading = true, error = null, noKit = false, forbidden = false)
            }
            runCatching { api.getKit(jobId).data }
                .onSuccess { kit ->
                    _state.update {
                        it.copy(
                            kit = kit,
                            loading = false,
                            noKit = kit == null,
                        )
                    }
                }
                .onFailure { e ->
                    val apiErr = e.toApiException()
                    _state.update {
                        it.copy(
                            loading = false,
                            noKit = apiErr.httpStatus == 404,
                            forbidden = apiErr.httpStatus == 403,
                            error = when (apiErr.httpStatus) {
                                404, 403 -> null
                                else -> apiErr.message
                            },
                        )
                    }
                }
        }
    }

    /** Sinh mới hoặc tái tạo toàn bộ câu hỏi bằng AI (đã xác nhận ở UI khi ghi đè). */
    fun generate() {
        if (_state.value.generating || _state.value.saving) return
        _state.update { it.copy(generating = true, message = null) }
        viewModelScope.launch {
            runCatching { api.generateKit(jobId).data }
                .onSuccess { kit ->
                    _state.update {
                        it.copy(
                            kit = kit,
                            generating = false,
                            noKit = false,
                            forbidden = false,
                            error = null,
                            message = if (kit != null) {
                                "Đã tạo bộ câu hỏi phiên bản ${kit.version ?: 1} " +
                                    "(${interviewKitSourceLabel(kit.generatedBy).lowercase()})."
                            } else {
                                "Đã tạo bộ câu hỏi phỏng vấn."
                            },
                            messageIsError = false,
                        )
                    }
                }
                .onFailure { e ->
                    val apiErr = e.toApiException()
                    _state.update {
                        it.copy(
                            generating = false,
                            forbidden = apiErr.httpStatus == 403 || it.forbidden,
                            message = apiErr.message,
                            messageIsError = true,
                        )
                    }
                }
        }
    }

    /** Sửa 1 câu tại [index] trong danh sách đầy đủ rồi PUT cả bộ lên server. */
    fun updateQuestion(index: Int, updated: InterviewQuestionDto) {
        val kit = _state.value.kit ?: return
        val questions = kit.questions ?: return
        if (index !in questions.indices) return
        if (_state.value.saving || _state.value.generating) return
        val newQuestions = questions.mapIndexed { i, q -> if (i == index) updated else q }
        _state.update { it.copy(saving = true, message = null) }
        viewModelScope.launch {
            runCatching {
                api.updateKit(jobId, InterviewKitUpdateBody(questions = newQuestions)).data
            }.onSuccess { saved ->
                _state.update {
                    it.copy(
                        kit = saved ?: kit.copy(questions = newQuestions),
                        saving = false,
                        message = "Đã lưu thay đổi câu hỏi.",
                        messageIsError = false,
                    )
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(
                        saving = false,
                        message = e.toApiException().message,
                        messageIsError = true,
                    )
                }
            }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: InterviewKitApi,
        private val sessionStore: SessionStore,
        private val jobId: Int,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            InterviewKitViewModel(api, sessionStore, jobId) as T
    }
}
