package com.hrmai.app.feature.announcements

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AnnouncementsUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val items: List<AnnouncementDto> = emptyList(),
    val error: String? = null,
    val expandedId: Int? = null,
    val toast: String? = null,
)

class AnnouncementsViewModel(
    private val api: AnnouncementsApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(AnnouncementsUiState())
    val state: StateFlow<AnnouncementsUiState> = _state

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { api.getAnnouncements() }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            loading = false,
                            items = resp.data ?: emptyList(),
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
            runCatching { api.getAnnouncements() }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(refreshing = false, items = resp.data ?: emptyList())
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(refreshing = false, toast = e.toApiException().message)
                    }
                }
        }
    }

    fun toggleExpand(id: Int?) {
        if (id == null) return
        _state.update {
            it.copy(expandedId = if (it.expandedId == id) null else id)
        }
    }

    fun consumeToast() = _state.update { it.copy(toast = null) }

    class Factory(
        private val api: AnnouncementsApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AnnouncementsViewModel(api, sessionStore) as T
    }
}
