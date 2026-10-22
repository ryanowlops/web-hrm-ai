package com.hrmai.app.feature.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdminUiState(
    val role: String? = null,
    /** Chỉ Admin mới quản trị được tài khoản (server cũng chặn 403). */
    val isAdmin: Boolean = false,
    /** Id tài khoản đang đăng nhập (để tránh tự khoá/tự đổi vai trò). */
    val myUserId: Int? = null,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val users: List<UserDto> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val totalItems: Int = 0,
    val loadingMore: Boolean = false,
    val query: String = "",
    /** Id tài khoản đang thực thi đổi vai trò/khoá (khoá nút của riêng dòng đó). */
    val actingId: Int? = null,
    /** Thông điệp một lần cho Snackbar (kể cả lỗi nghiệp vụ từ server). */
    val toast: String? = null,
)

class AdminViewModel(
    private val api: AdminApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminUiState())
    val state: StateFlow<AdminUiState> = _state

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                _state.update {
                    it.copy(
                        role = role,
                        isAdmin = role == "admin",
                        myUserId = session?.user?.id,
                    )
                }
                if (role == "admin" && _state.value.users.isEmpty() && _state.value.error == null) {
                    load()
                } else if (role != null && role != "admin") {
                    _state.update { it.copy(loading = false) }
                }
            }
        }
    }

    fun load() {
        if (!_state.value.isAdmin) return
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch { fetchPage(page = 1, append = false) }
    }

    fun refresh() {
        if (_state.value.refreshing || !_state.value.isAdmin) return
        _state.update { it.copy(refreshing = true) }
        viewModelScope.launch { fetchPage(page = 1, append = false) }
    }

    fun loadMore() {
        val s = _state.value
        if (s.loadingMore || s.page >= s.totalPages || !s.isAdmin) return
        _state.update { it.copy(loadingMore = true) }
        viewModelScope.launch { fetchPage(page = s.page + 1, append = true) }
    }

    private suspend fun fetchPage(page: Int, append: Boolean) {
        val query = _state.value.query.trim().ifBlank { null }
        runCatching { api.getUsers(page = page, limit = PAGE_SIZE, search = query) }
            .onSuccess { resp ->
                _state.update { st ->
                    st.copy(
                        loading = false,
                        refreshing = false,
                        loadingMore = false,
                        error = null,
                        users = if (append) {
                            st.users + (resp.data ?: emptyList())
                        } else {
                            resp.data ?: emptyList()
                        },
                        page = resp.meta?.page ?: page,
                        totalPages = resp.meta?.totalPages ?: 1,
                        totalItems = resp.meta?.totalItems ?: 0,
                    )
                }
            }
            .onFailure { e ->
                _state.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        loadingMore = false,
                        error = if (append) it.error else e.toApiException().message,
                        toast = if (append) e.toApiException().message else it.toast,
                    )
                }
            }
    }

    /** Tìm kiếm có trễ ngắn để tránh gọi API theo từng ký tự. */
    fun onQueryChange(value: String) {
        _state.update { it.copy(query = value) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(350)
            load()
        }
    }

    /** Đổi vai trò — chỉ gọi sau khi người dùng xác nhận ở hộp thoại. */
    fun updateRole(user: UserDto, newRole: String) {
        val id = user.id ?: return
        if (_state.value.actingId != null || newRole == user.role) return
        _state.update { it.copy(actingId = id) }
        viewModelScope.launch {
            runCatching {
                api.updateUser(id, mapOf("role" to newRole))
            }.onSuccess { updated ->
                applyUpdated(updated, "Đã đổi vai trò của ${user.fullName ?: user.email ?: "tài khoản"} thành ${UserRoles.labelOf(newRole)}.")
            }.onFailure { e ->
                _state.update {
                    it.copy(actingId = null, toast = e.toApiException().message)
                }
            }
        }
    }

    /** Khoá/mở khoá — chỉ gọi sau khi người dùng xác nhận ở hộp thoại. */
    fun updateActive(user: UserDto, active: Boolean) {
        val id = user.id ?: return
        if (_state.value.actingId != null || active == (user.isActive == true)) return
        _state.update { it.copy(actingId = id) }
        viewModelScope.launch {
            runCatching {
                api.updateUser(id, mapOf("is_active" to active))
            }.onSuccess { updated ->
                applyUpdated(
                    updated,
                    if (active) {
                        "Đã mở khoá tài khoản ${user.fullName ?: user.email ?: ""}."
                    } else {
                        "Đã khoá tài khoản ${user.fullName ?: user.email ?: ""}."
                    },
                )
            }.onFailure { e ->
                _state.update {
                    it.copy(actingId = null, toast = e.toApiException().message)
                }
            }
        }
    }

    private fun applyUpdated(updated: UserDto, message: String) {
        _state.update { st ->
            st.copy(
                actingId = null,
                users = st.users.map { if (it.id == updated.id) updated else it },
                toast = message,
            )
        }
    }

    fun consumeToast() = _state.update { it.copy(toast = null) }

    class Factory(
        private val api: AdminApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AdminViewModel(api, sessionStore) as T
    }

    companion object {
        private const val PAGE_SIZE = 50
    }
}
