package com.hrmai.app.feature.surveys

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
import org.json.JSONObject

data class SurveysUiState(
    val role: String? = null,
    /** Chỉ admin/hr mới xem được kết quả tổng hợp (route results chặn 403). */
    val canSeeResults: Boolean = false,
    val surveys: List<SurveyDto> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    val refreshing: Boolean = false,
    /** Khảo sát đang mở form trả lời. */
    val answeringId: Int? = null,
    /** Đáp án đang soạn: qid -> Int (enps/scale) hoặc String (single/text). */
    val answers: Map<String, Any> = emptyMap(),
    val formError: String? = null,
    val submitting: Boolean = false,
    /** Kết quả tổng hợp theo survey id (chỉ HR/Admin tải được). */
    val results: Map<Int, SurveyResultsDto> = emptyMap(),
    val resultsOpenId: Int? = null,
    val resultsLoadingId: Int? = null,
    val resultsError: String? = null,
    val message: String? = null,
)

class SurveysViewModel(
    private val api: SurveysApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(SurveysUiState())
    val state: StateFlow<SurveysUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                _state.update {
                    it.copy(role = role, canSeeResults = role in RESULT_ROLES)
                }
            }
        }
        load()
    }

    // ------------------------------------------------------------------
    // Tải danh sách
    // ------------------------------------------------------------------
    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            fetch()
        }
    }

    private suspend fun fetch() {
        runCatching { api.listSurveys() }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        surveys = resp.data ?: emptyList(),
                        loading = false,
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

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetch()
            _state.update { it.copy(refreshing = false) }
        }
    }

    // ------------------------------------------------------------------
    // Trả lời khảo sát (ẩn danh)
    // ------------------------------------------------------------------
    fun toggleAnswerForm(survey: SurveyDto) {
        val id = survey.id ?: return
        _state.update {
            if (it.answeringId == id) {
                it.copy(answeringId = null, answers = emptyMap(), formError = null)
            } else {
                it.copy(answeringId = id, answers = emptyMap(), formError = null)
            }
        }
    }

    fun setAnswer(questionId: String, value: Any) {
        _state.update {
            it.copy(answers = it.answers + (questionId to value), formError = null)
        }
    }

    /** Validate phía client khớp schemas.validate_answers của server:
     *  enps (0..10), scale (1..5), single: bắt buộc; text: tuỳ chọn. */
    fun submit(survey: SurveyDto) {
        val id = survey.id ?: return
        val s = _state.value
        if (s.submitting) return
        val missing = survey.questions.orEmpty().firstOrNull { q ->
            q.type in REQUIRED_TYPES && s.answers[q.id] == null
        }
        if (missing != null) {
            _state.update {
                it.copy(formError = "Bạn trả lời nốt câu \"${missing.text ?: ""}\" giúp em nhé.")
            }
            return
        }
        _state.update { it.copy(submitting = true, formError = null) }
        viewModelScope.launch {
            runCatching {
                val answersJson = JSONObject()
                s.answers.forEach { (qid, value) -> answersJson.put(qid, value) }
                val body = JSONObject().put("answers", answersJson).toString()
                    .toRequestBody(JSON_MEDIA_TYPE)
                api.respond(id, body)
            }.onSuccess {
                _state.update { st ->
                    st.copy(
                        submitting = false,
                        answeringId = null,
                        answers = emptyMap(),
                        surveys = st.surveys.map { item ->
                            if (item.id == id) item.copy(responded = true) else item
                        },
                        message = "Cảm ơn bạn! Câu trả lời đã được ghi nhận ẩn danh.",
                    )
                }
            }.onFailure { e ->
                // 409 (đã trả lời / khảo sát đóng): hiện nguyên thông điệp server.
                _state.update {
                    it.copy(submitting = false, formError = e.toApiException().message)
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Kết quả tổng hợp (HR/Admin)
    // ------------------------------------------------------------------
    fun toggleResults(survey: SurveyDto) {
        val id = survey.id ?: return
        if (_state.value.resultsOpenId == id) {
            _state.update { it.copy(resultsOpenId = null) }
            return
        }
        _state.update { it.copy(resultsOpenId = id, resultsError = null) }
        if (_state.value.results.containsKey(id)) return
        viewModelScope.launch {
            _state.update { it.copy(resultsLoadingId = id) }
            runCatching { api.results(id) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            resultsLoadingId = null,
                            results = resp.data?.let { data -> it.results + (id to data) }
                                ?: it.results,
                        )
                    }
                }
                .onFailure { e ->
                    val apiError = e.toApiException()
                    _state.update {
                        it.copy(
                            resultsLoadingId = null,
                            resultsError = if (apiError.httpStatus == 403) {
                                "Chỉ HR và Admin mới xem được kết quả tổng hợp."
                            } else {
                                apiError.message
                            },
                        )
                    }
                }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: SurveysApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            SurveysViewModel(api, sessionStore) as T
    }

    companion object {
        private val RESULT_ROLES = setOf("hr", "admin")
        private val REQUIRED_TYPES = setOf("enps", "scale", "single")
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}
