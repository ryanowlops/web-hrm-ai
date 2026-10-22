package com.hrmai.app.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.datastore.SessionUser
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Khối dữ liệu độc lập của màn hồ sơ. */
sealed interface ProfileBlock<out T> {
    data object Loading : ProfileBlock<Nothing>
    data class Content<T>(val value: T) : ProfileBlock<T>
    data class Failed(val message: String) : ProfileBlock<Nothing>
}

data class ProfileUiState(
    val user: SessionUser? = null,
    val employee: ProfileBlock<EmployeeDto> = ProfileBlock.Loading,
    val skills: ProfileBlock<List<EmployeeSkillDto>> = ProfileBlock.Loading,
)

class ProfileViewModel(
    private val api: ProfileApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val user = session?.user
                _state.update { it.copy(user = user) }
                // Chỉ tải một lần cho user đầu tiên có phiên.
                if (user != null && _state.value.employee is ProfileBlock.Loading) {
                    loadAll(user)
                }
            }
        }
    }

    fun retry() {
        val user = _state.value.user ?: return
        _state.update {
            it.copy(
                employee = ProfileBlock.Loading,
                skills = ProfileBlock.Loading,
            )
        }
        loadAll(user)
    }

    fun logout() {
        viewModelScope.launch { sessionStore.clear() }
    }

    private fun loadAll(user: SessionUser) {
        // Theo cách bản web làm: ưu tiên employee_id, thiếu thì dùng id tài khoản.
        val targetId = user.employeeId ?: user.id ?: return
        viewModelScope.launch {
            runCatching { api.employee(targetId).data }
                .onSuccess { dto ->
                    _state.update {
                        it.copy(
                            employee = if (dto == null) {
                                ProfileBlock.Failed("Không tìm thấy thông tin nhân viên.")
                            } else {
                                ProfileBlock.Content(dto)
                            },
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(employee = ProfileBlock.Failed(e.toApiException().message))
                    }
                }
        }
        viewModelScope.launch {
            runCatching { api.employeeSkills(targetId).data?.items ?: emptyList() }
                .onSuccess { list ->
                    _state.update { it.copy(skills = ProfileBlock.Content(list)) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(skills = ProfileBlock.Failed(e.toApiException().message))
                    }
                }
        }
    }

    class Factory(
        private val api: ProfileApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ProfileViewModel(api, sessionStore) as T
    }
}
