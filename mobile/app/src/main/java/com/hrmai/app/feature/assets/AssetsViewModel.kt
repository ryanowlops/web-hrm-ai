package com.hrmai.app.feature.assets

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AssetsUiState(
    /** 0 = Tài sản của tôi, 1 = Toàn bộ tài sản. */
    val tab: Int = 0,
    val role: String? = null,
    /** admin/hr/manager xem được danh mục toàn công ty (GET /assets). */
    val canViewAll: Boolean = false,
    /** Chỉ admin/hr được cấp phát / thu hồi (server WRITE_ROLES). */
    val canManage: Boolean = false,
    // Tài sản của tôi
    val myAssets: List<MyAssetDto> = emptyList(),
    val myLoading: Boolean = true,
    val myError: String? = null,
    val myRefreshing: Boolean = false,
    // Toàn bộ tài sản
    val allAssets: List<AssetDto> = emptyList(),
    val allLoading: Boolean = false,
    val allError: String? = null,
    val allRefreshing: Boolean = false,
    /** Danh sách nhân viên cho hộp thoại cấp phát (chỉ tải khi canManage). */
    val employees: List<EmployeeOptionDto> = emptyList(),
    /** Id tài sản đang cấp phát/thu hồi. */
    val actingId: Int? = null,
    val message: String? = null,
)

class AssetsViewModel(
    private val api: AssetsApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(AssetsUiState())
    val state: StateFlow<AssetsUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                if (_state.value.role != role) {
                    _state.update {
                        it.copy(
                            role = role,
                            canViewAll = role in VIEW_ALL_ROLES,
                            canManage = role in MANAGE_ROLES,
                        )
                    }
                    if (role in MANAGE_ROLES) loadEmployees()
                }
            }
        }
        loadMine()
    }

    fun loadMine() {
        viewModelScope.launch {
            _state.update { it.copy(myLoading = true, myError = null) }
            fetchMine()
        }
    }

    private suspend fun fetchMine() {
        runCatching { api.getMyAssets() }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        myAssets = resp.data ?: emptyList(),
                        myLoading = false,
                        myError = null,
                    )
                }
            }
            .onFailure { e ->
                _state.update {
                    it.copy(myLoading = false, myError = e.toApiException().message)
                }
            }
    }

    fun refreshMine() {
        if (_state.value.myRefreshing) return
        viewModelScope.launch {
            _state.update { it.copy(myRefreshing = true) }
            fetchMine()
            _state.update { it.copy(myRefreshing = false) }
        }
    }

    fun loadAll() {
        if (!_state.value.canViewAll || _state.value.allLoading) return
        viewModelScope.launch {
            _state.update { it.copy(allLoading = true, allError = null) }
            fetchAll()
        }
    }

    private suspend fun fetchAll() {
        runCatching { api.getAssets(page = 1, limit = 100, status = null) }
            .onSuccess { resp ->
                _state.update {
                    it.copy(
                        allAssets = resp.data ?: emptyList(),
                        allLoading = false,
                        allError = null,
                    )
                }
            }
            .onFailure { e ->
                // 403 (vai trò không được xem danh mục): toApiException đã
                // cho thông điệp thân thiện mặc định.
                _state.update {
                    it.copy(allLoading = false, allError = e.toApiException().message)
                }
            }
    }

    fun refreshAll() {
        if (_state.value.allRefreshing || !_state.value.canViewAll) return
        viewModelScope.launch {
            _state.update { it.copy(allRefreshing = true, allError = null) }
            fetchAll()
            _state.update { it.copy(allRefreshing = false) }
        }
    }

    private fun loadEmployees() {
        viewModelScope.launch {
            runCatching { api.getEmployees(page = 1, limit = 200) }
                .onSuccess { resp ->
                    _state.update { it.copy(employees = resp.data ?: emptyList()) }
                }
        }
    }

    fun selectTab(index: Int) {
        if (index == 1 && !_state.value.canViewAll) return
        _state.update { it.copy(tab = index) }
        if (index == 1) loadAll()
    }

    /** Cấp phát tài sản đang "available" cho một nhân viên (chỉ HR/Admin). */
    fun assign(asset: AssetDto, employeeId: Int, note: String) {
        val assetId = asset.id ?: return
        if (_state.value.actingId != null) return
        _state.update { it.copy(actingId = assetId) }
        viewModelScope.launch {
            runCatching {
                api.assignAsset(
                    assetId,
                    AssignAssetBody(
                        employeeId = employeeId,
                        note = note.trim().ifBlank { null },
                    ),
                )
            }.onSuccess { resp ->
                _state.update {
                    it.copy(
                        actingId = null,
                        message = "Đã cấp phát ${asset.code ?: "tài sản"} cho " +
                            "${resp.data?.employeeName ?: "nhân viên"}.",
                    )
                }
                fetchAll()
                fetchMine()
            }.onFailure { e ->
                _state.update {
                    it.copy(actingId = null, message = e.toApiException().message)
                }
            }
        }
    }

    /** Thu hồi tài sản đang có người giữ (chỉ HR/Admin). */
    fun returnAsset(asset: AssetDto, note: String) {
        val assignmentId = asset.holder?.assignmentId ?: return
        val assetId = asset.id ?: return
        if (_state.value.actingId != null) return
        _state.update { it.copy(actingId = assetId) }
        viewModelScope.launch {
            runCatching {
                api.returnAssignment(
                    assignmentId,
                    ReturnAssetBody(note = note.trim().ifBlank { null }),
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        actingId = null,
                        message = "Đã thu hồi ${asset.code ?: "tài sản"}.",
                    )
                }
                fetchAll()
                fetchMine()
            }.onFailure { e ->
                _state.update {
                    it.copy(actingId = null, message = e.toApiException().message)
                }
            }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: AssetsApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AssetsViewModel(api, sessionStore) as T
    }

    companion object {
        private val VIEW_ALL_ROLES = setOf("admin", "hr", "manager")
        private val MANAGE_ROLES = setOf("admin", "hr")
    }
}
