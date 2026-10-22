package com.hrmai.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.Session
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.ApiClient
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val baseUrl: String = "",
    val showServerField: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
)

class LoginViewModel(private val sessionStore: SessionStore) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state

    init {
        viewModelScope.launch {
            _state.update { it.copy(baseUrl = sessionStore.currentBaseUrl()) }
        }
    }

    fun onEmailChange(v: String) = _state.update { it.copy(email = v, error = null) }
    fun onPasswordChange(v: String) = _state.update { it.copy(password = v, error = null) }
    fun onBaseUrlChange(v: String) = _state.update { it.copy(baseUrl = v) }
    fun toggleServerField() = _state.update { it.copy(showServerField = !it.showServerField) }

    fun fillDemo(email: String, password: String) =
        _state.update { it.copy(email = email, password = password, error = null) }

    fun login() {
        val s = _state.value
        if (s.loading) return
        if (s.email.isBlank() || s.password.isBlank()) {
            _state.update { it.copy(error = "Nhập email và mật khẩu giúp em nhé.") }
            return
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val baseUrl = SessionStore.normalizeBaseUrl(s.baseUrl)
                val api = ApiClient.plainRetrofit(baseUrl).create(AuthApi::class.java)
                val resp = api.login(LoginRequest(s.email.trim(), s.password))
                val access = resp.accessToken ?: resp.data?.accessToken
                val refresh = resp.refreshToken ?: resp.data?.refreshToken
                val user = resp.user ?: resp.data?.user
                if (access == null || user == null) {
                    throw IllegalStateException("Phản hồi đăng nhập không hợp lệ")
                }
                sessionStore.save(Session(access, refresh, user, baseUrl))
            }.onFailure { e ->
                _state.update { it.copy(loading = false, error = e.toApiException().message) }
            }
            // Thành công: sessionFlow phát phiên mới, NavHost tự chuyển màn.
        }
    }

    class Factory(private val sessionStore: SessionStore) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            LoginViewModel(sessionStore) as T
    }
}
