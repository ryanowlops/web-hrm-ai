package com.hrmai.app.feature.attrition

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AttritionUiState(
    val role: String? = null,
    /** Vai trò không được phép xem (employee) hoặc server trả 403. */
    val forbidden: Boolean = false,
    val data: AttritionDataDto? = null,
    val loading: Boolean = true,
    val error: String? = null,
    val refreshing: Boolean = false,
    /** null = tất cả; còn lại: low | medium | high (lọc phía server). */
    val levelFilter: String? = null,
)

class AttritionViewModel(
    private val api: AttritionApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(AttritionUiState())
    val state: StateFlow<AttritionUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role ?: return@collect
                val wasForbidden = _state.value.forbidden
                _state.update { it.copy(role = role) }
                if (role !in ALLOWED_ROLES) {
                    // Chặn ngay ở client theo đúng require_roles phía server;
                    // nhân viên thấy thông điệp thân thiện thay vì lỗi 403 thô.
                    _state.update { it.copy(forbidden = true, loading = false) }
                } else if (_state.value.data == null && !wasForbidden) {
                    fetch(showLoading = true)
                }
            }
        }
    }

    fun load() {
        if (_state.value.forbidden) return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            fetch(showLoading = false)
        }
    }

    fun refresh() {
        if (_state.value.refreshing || _state.value.forbidden) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetch(showLoading = false)
            _state.update { it.copy(refreshing = false) }
        }
    }

    fun selectLevel(level: String?) {
        if (_state.value.levelFilter == level || _state.value.forbidden) return
        _state.update { it.copy(levelFilter = level, loading = true, error = null) }
        viewModelScope.launch { fetch(showLoading = false) }
    }

    private suspend fun fetch(showLoading: Boolean) {
        if (showLoading) _state.update { it.copy(loading = true, error = null) }
        runCatching { api.getAttritionRisk(_state.value.levelFilter) }
            .onSuccess { resp ->
                _state.update {
                    it.copy(data = resp.data, loading = false, error = null)
                }
            }
            .onFailure { e ->
                val apiError = e.toApiException()
                if (apiError.httpStatus == 403) {
                    // Dự phòng: role lạ / tài khoản quản lý chưa gắn hồ sơ
                    // nhân viên (server cũng trả 403 kèm thông điệp riêng).
                    _state.update {
                        it.copy(
                            forbidden = true,
                            loading = false,
                            error = null,
                        )
                    }
                } else {
                    _state.update {
                        it.copy(loading = false, error = apiError.message)
                    }
                }
            }
    }

    class Factory(
        private val api: AttritionApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AttritionViewModel(api, sessionStore) as T
    }

    companion object {
        private val ALLOWED_ROLES = setOf("admin", "hr", "manager")

        const val LEVEL_LOW = "low"
        const val LEVEL_MEDIUM = "medium"
        const val LEVEL_HIGH = "high"
    }
}
