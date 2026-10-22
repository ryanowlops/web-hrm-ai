package com.hrmai.app.feature.jd

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class JdUiState(
    /** Role đọc từ phiên đăng nhập; null = chưa tải xong phiên. */
    val role: String? = null,
    val roleLoaded: Boolean = false,
    // Form soạn JD
    val title: String = "",
    val departmentName: String = "",
    val level: String = JD_DEFAULT_LEVEL,
    /** Kỹ năng nhập tự do, cách nhau bằng dấu phẩy (server nhận List). */
    val skillsText: String = "",
    val salaryNote: String = "",
    val formError: String? = null,
    val generating: Boolean = false,
    // Kết quả gần nhất
    val result: JdResultDto? = null,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
) {
    /** Endpoint /jd/generate chỉ cho hr/admin (require_roles phía server). */
    val canUse: Boolean get() = role == "hr" || role == "admin"
}

class JdViewModel(
    private val api: JdApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(JdUiState())
    val state: StateFlow<JdUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                _state.update {
                    it.copy(role = session?.user?.role, roleLoaded = true)
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Form
    // ------------------------------------------------------------------
    fun setTitle(text: String) = _state.update { it.copy(title = text, formError = null) }

    fun setDepartmentName(text: String) =
        _state.update { it.copy(departmentName = text, formError = null) }

    fun setLevel(value: String) = _state.update { it.copy(level = value, formError = null) }

    fun setSkillsText(text: String) =
        _state.update { it.copy(skillsText = text, formError = null) }

    fun setSalaryNote(text: String) =
        _state.update { it.copy(salaryNote = text, formError = null) }

    /** "Python, Flask , PostgreSQL" -> ["Python", "Flask", "PostgreSQL"] (bỏ trùng). */
    private fun parseSkills(raw: String): List<String> =
        raw.split(",")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinctBy { it.lowercase() }

    fun generate() {
        val s = _state.value
        if (s.generating) return
        if (s.title.isBlank()) {
            _state.update { it.copy(formError = "Nhập chức danh vị trí cần tuyển giúp em nhé.") }
            return
        }
        _state.update { it.copy(generating = true, formError = null) }
        viewModelScope.launch {
            runCatching {
                api.generate(
                    JdGenerateRequest(
                        title = s.title.trim(),
                        departmentName = s.departmentName.trim().ifBlank { null },
                        level = s.level,
                        skills = parseSkills(s.skillsText),
                        salaryNote = s.salaryNote.trim().ifBlank { null },
                    ),
                )
            }.onSuccess { resp ->
                val result = resp.data
                _state.update {
                    it.copy(
                        generating = false,
                        result = result,
                        formError = if (result == null) {
                            "Server không trả về nội dung JD. Anh thử lại giúp em nhé."
                        } else {
                            null
                        },
                    )
                }
            }.onFailure { e ->
                _state.update {
                    it.copy(generating = false, formError = e.toApiException().message)
                }
            }
        }
    }

    /** Xoá kết quả để soạn bản khác (màn hình tự cuộn về form). */
    fun clearResult() = _state.update { it.copy(result = null, formError = null) }

    fun notifyCopied() =
        _state.update { it.copy(message = "Đã sao chép toàn bộ JD vào bộ nhớ tạm.") }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: JdApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            JdViewModel(api, sessionStore) as T
    }
}
