package com.hrmai.app.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NotificationsUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val items: List<NotificationDto> = emptyList(),
    val unreadCount: Int = 0,
    val error: String? = null,
    val markingAll: Boolean = false,
    val toast: String? = null,
)

class NotificationsViewModel(
    private val api: NotificationsApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { api.getNotifications() }
                .onSuccess { resp ->
                    val items = resp.data ?: emptyList()
                    _state.update {
                        it.copy(
                            loading = false,
                            items = items,
                            unreadCount = resp.unreadCount
                                ?: items.count { n -> n.isRead != true },
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
    }

    fun refresh() {
        if (_state.value.refreshing) return
        _state.update { it.copy(refreshing = true) }
        viewModelScope.launch {
            runCatching { api.getNotifications() }
                .onSuccess { resp ->
                    val items = resp.data ?: emptyList()
                    _state.update {
                        it.copy(
                            refreshing = false,
                            items = items,
                            unreadCount = resp.unreadCount
                                ?: items.count { n -> n.isRead != true },
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(refreshing = false, toast = e.toApiException().message)
                    }
                }
        }
    }

    /** Chạm vào một thông báo chưa đọc: đánh dấu đã đọc (lạc quan + chốt theo server). */
    fun markRead(item: NotificationDto) {
        val id = item.id ?: return
        if (item.isRead == true) return
        val before = _state.value.items.firstOrNull { it.id == id } ?: return
        replaceItem(before.copy(isRead = true))
        _state.update {
            it.copy(unreadCount = (it.unreadCount - 1).coerceAtLeast(0))
        }
        viewModelScope.launch {
            runCatching { api.markRead(id) }
                .onSuccess { resp ->
                    resp.notification?.let { replaceItem(it) }
                    resp.unreadCount?.let { count ->
                        _state.update { it.copy(unreadCount = count) }
                    }
                }
                .onFailure { e ->
                    replaceItem(before)
                    _state.update { st ->
                        st.copy(
                            unreadCount = st.items.count { n -> n.isRead != true },
                            toast = e.toApiException().message,
                        )
                    }
                }
        }
    }

    fun markAllRead() {
        val s = _state.value
        if (s.markingAll || s.unreadCount == 0) return
        _state.update { it.copy(markingAll = true) }
        viewModelScope.launch {
            runCatching { api.markAllRead() }
                .onSuccess {
                    _state.update { st ->
                        st.copy(
                            markingAll = false,
                            items = st.items.map { n -> n.copy(isRead = true) },
                            unreadCount = 0,
                            toast = "Đã đánh dấu tất cả là đã đọc",
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(markingAll = false, toast = e.toApiException().message)
                    }
                }
        }
    }

    fun consumeToast() = _state.update { it.copy(toast = null) }

    private fun replaceItem(item: NotificationDto) {
        _state.update { st ->
            st.copy(items = st.items.map { n -> if (n.id == item.id) item else n })
        }
    }

    class Factory(
        private val api: NotificationsApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            NotificationsViewModel(api, sessionStore) as T
    }
}
