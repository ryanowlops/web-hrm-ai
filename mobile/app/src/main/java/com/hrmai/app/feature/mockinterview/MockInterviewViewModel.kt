package com.hrmai.app.feature.mockinterview

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.feature.jobs.JobPostingDto
import com.hrmai.app.feature.jobs.JobsApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class InterviewPhase { SETUP, IN_PROGRESS, REPORT }

/** Một lượt hội thoại trong phòng phỏng vấn (câu hỏi của HR ảo / câu trả lời). */
data class InterviewTurn(
    val fromInterviewer: Boolean,
    val text: String,
)

data class MockInterviewUiState(
    val phase: InterviewPhase = InterviewPhase.SETUP,
    val jobsLoading: Boolean = true,
    val jobs: List<JobPostingDto> = emptyList(),
    val jobsError: String? = null,
    val selectedJobId: Int? = null,
    /** true khi chưa đăng nhập -> cần họ tên + email khách để lấy access_token. */
    val isGuest: Boolean = false,
    val guestName: String = "",
    val guestEmail: String = "",
    val starting: Boolean = false,
    val error: String? = null,
    // --- Phiên đang chạy ---
    val sessionId: Int? = null,
    val accessToken: String? = null,
    val jobTitle: String? = null,
    val totalQuestions: Int = 0,
    val answeredCount: Int = 0,
    val turns: List<InterviewTurn> = emptyList(),
    val draft: String = "",
    val sending: Boolean = false,
    val allAnswered: Boolean = false,
    // --- Báo cáo ---
    val finishing: Boolean = false,
    val report: InterviewSessionDto? = null,
)

class MockInterviewViewModel(
    private val jobsApi: JobsApi,
    private val interviewApi: MockInterviewApi,
    sessionStore: SessionStore,
) : ViewModel() {
    private val _state = MutableStateFlow(
        MockInterviewUiState(isGuest = sessionStore.sessionFlow.value == null)
    )
    val state: StateFlow<MockInterviewUiState> = _state

    init { loadJobs() }

    fun loadJobs() {
        _state.update { it.copy(jobsLoading = true, jobsError = null) }
        viewModelScope.launch {
            runCatching { jobsApi.listOpenJobs().data }
                .onSuccess { jobs ->
                    _state.update {
                        it.copy(
                            jobsLoading = false,
                            jobs = jobs,
                            selectedJobId = it.selectedJobId ?: jobs.firstOrNull()?.id,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(jobsLoading = false, jobsError = e.toApiException().message)
                    }
                }
        }
    }

    fun selectJob(jobId: Int) = _state.update { it.copy(selectedJobId = jobId, error = null) }
    fun onGuestNameChange(v: String) = _state.update { it.copy(guestName = v, error = null) }
    fun onGuestEmailChange(v: String) = _state.update { it.copy(guestEmail = v, error = null) }
    fun onDraftChange(v: String) = _state.update { it.copy(draft = v) }

    fun start() {
        val s = _state.value
        if (s.starting) return
        val jobId = s.selectedJobId
        if (jobId == null) {
            _state.update { it.copy(error = "Bạn chọn một vị trí để phỏng vấn thử nhé.") }
            return
        }
        if (s.isGuest) {
            if (s.guestName.trim().length < 2) {
                _state.update { it.copy(error = "Bạn nhập họ tên (ít nhất 2 ký tự) nhé.") }
                return
            }
            if (!s.guestEmail.contains("@")) {
                _state.update { it.copy(error = "Email liên hệ chưa đúng định dạng.") }
                return
            }
        }
        _state.update { it.copy(starting = true, error = null) }
        viewModelScope.launch {
            runCatching {
                interviewApi.start(
                    StartInterviewRequest(
                        jobId = jobId,
                        guestName = if (s.isGuest) s.guestName.trim() else null,
                        guestEmail = if (s.isGuest) s.guestEmail.trim() else null,
                    )
                ).data
            }.onSuccess { started ->
                val firstTurn = started.firstQuestion?.let {
                    InterviewTurn(fromInterviewer = true, text = it.question)
                }
                _state.update {
                    it.copy(
                        starting = false,
                        phase = InterviewPhase.IN_PROGRESS,
                        sessionId = started.sessionId,
                        accessToken = started.accessToken,
                        jobTitle = started.job?.title,
                        totalQuestions = started.totalQuestions,
                        answeredCount = 0,
                        turns = listOfNotNull(firstTurn),
                        allAnswered = started.firstQuestion == null,
                    )
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(starting = false, error = e.toApiException().message)
                }
            }
        }
    }

    fun sendAnswer() {
        val s = _state.value
        if (s.sending || s.finishing) return
        val sessionId = s.sessionId ?: return
        val answer = s.draft.trim()
        if (answer.isEmpty()) return
        _state.update { it.copy(sending = true, error = null) }
        viewModelScope.launch {
            runCatching {
                interviewApi.answer(sessionId, s.accessToken, AnswerRequest(answer)).data
            }.onSuccess { result ->
                _state.update { current ->
                    val newTurns = current.turns +
                        InterviewTurn(fromInterviewer = false, text = answer) +
                        listOfNotNull(
                            result.nextQuestion?.let {
                                InterviewTurn(fromInterviewer = true, text = it.question)
                            }
                        )
                    current.copy(
                        sending = false,
                        draft = "",
                        turns = newTurns,
                        answeredCount = result.answeredCount,
                        totalQuestions = result.totalQuestions,
                        allAnswered = result.done,
                    )
                }
                // Trả lời xong câu cuối -> tự kết thúc để lấy báo cáo
                // (finish phía server idempotent nên gọi thừa vẫn an toàn).
                if (result.done) finish()
            }.onFailure { e ->
                _state.update {
                    it.copy(sending = false, error = e.toApiException().message)
                }
            }
        }
    }

    fun finish() {
        val s = _state.value
        if (s.finishing) return
        val sessionId = s.sessionId ?: return
        _state.update { it.copy(finishing = true, error = null) }
        viewModelScope.launch {
            runCatching {
                interviewApi.finish(sessionId, s.accessToken).data
            }.onSuccess { report ->
                _state.update {
                    it.copy(
                        finishing = false,
                        report = report,
                        phase = InterviewPhase.REPORT,
                    )
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(finishing = false, error = e.toApiException().message)
                }
            }
        }
    }

    /** Làm lại từ đầu: giữ danh sách vị trí đã tải, xoá phiên hiện tại. */
    fun restart() {
        _state.update {
            MockInterviewUiState(
                isGuest = it.isGuest,
                jobs = it.jobs,
                jobsLoading = false,
                selectedJobId = it.selectedJobId,
                guestName = it.guestName,
                guestEmail = it.guestEmail,
            )
        }
    }

    class Factory(
        private val jobsApi: JobsApi,
        private val interviewApi: MockInterviewApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            MockInterviewViewModel(jobsApi, interviewApi, sessionStore) as T
    }
}
