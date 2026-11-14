package com.hrmai.app.feature.disciplinary

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.core.util.Format
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

data class DisciplinaryUiState(
    val role: String? = null,
    /** Chỉ admin/hr được lập biên bản + giải quyết (WRITE_ROLES phía web). */
    val canWrite: Boolean = false,
    val roleKnown: Boolean = false,
    // Danh sách biên bản
    val records: List<DisciplinaryRecordDto> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    /** Server trả 403 (vai trò không đủ quyền dù app đã chặn trước). */
    val forbidden: Boolean = false,
    val refreshing: Boolean = false,
    val statusFilter: String = "",
    val severityFilter: String = "",
    // Chi tiết 1 biên bản
    val detail: DisciplinaryRecordDto? = null,
    val detailLoading: Boolean = false,
    val detailError: String? = null,
    // Form lập biên bản mới
    val showCreateForm: Boolean = false,
    val employees: List<DisciplinaryEmployeeDto> = emptyList(),
    val employeesLoading: Boolean = false,
    val showEmployeePicker: Boolean = false,
    val selectedEmployee: DisciplinaryEmployeeDto? = null,
    val formType: String = "written",
    val formSeverity: String = "medium",
    val formTitle: String = "",
    val formDescription: String = "",
    val formActionTaken: String = "",
    val formIssuedDate: LocalDate = Format.today(),
    val creating: Boolean = false,
    val createError: String? = null,
    // Giải quyết biên bản
    val resolvingRecord: DisciplinaryRecordDto? = null,
    val resolvedNote: String = "",
    val resolving: Boolean = false,
    val resolveError: String? = null,
    /** Thông điệp một lần cho Snackbar. */
    val message: String? = null,
)

class DisciplinaryViewModel(
    private val api: DisciplinaryApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(DisciplinaryUiState())
    val state: StateFlow<DisciplinaryUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                if (role != null && _state.value.role != role) {
                    _state.update {
                        it.copy(
                            role = role,
                            canWrite = role in WRITE_ROLES,
                            roleKnown = true,
                        )
                    }
                    loadRecords()
                }
            }
        }
    }

    fun loadRecords() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, forbidden = false) }
            fetchRecords()
        }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetchRecords()
            _state.update { it.copy(refreshing = false) }
        }
    }

    private suspend fun fetchRecords() {
        val s = _state.value
        runCatching {
            api.getRecords(
                status = s.statusFilter.ifBlank { null },
                severity = s.severityFilter.ifBlank { null },
            )
        }.onSuccess { resp ->
            _state.update {
                it.copy(
                    records = resp.data ?: emptyList(),
                    loading = false,
                    error = null,
                    forbidden = false,
                )
            }
        }.onFailure { e ->
            val ex = e.toApiException()
            _state.update {
                it.copy(
                    loading = false,
                    error = if (ex.httpStatus == 403) null else ex.message,
                    forbidden = ex.httpStatus == 403,
                )
            }
        }
    }

    fun setStatusFilter(value: String) {
        if (_state.value.statusFilter == value) return
        _state.update { it.copy(statusFilter = value) }
        loadRecords()
    }

    fun setSeverityFilter(value: String) {
        if (_state.value.severityFilter == value) return
        _state.update { it.copy(severityFilter = value) }
        loadRecords()
    }

    // ---- Chi tiết ----

    fun openRecord(recordId: Int, silent: Boolean = false) {
        viewModelScope.launch {
            if (!silent) {
                _state.update {
                    it.copy(detailLoading = true, detailError = null, detail = null)
                }
            }
            runCatching { api.getRecord(recordId) }
                .onSuccess { resp ->
                    _state.update {
                        it.copy(
                            detail = resp.data,
                            detailLoading = false,
                            detailError = if (resp.data == null) {
                                "Không tìm thấy biên bản kỷ luật."
                            } else {
                                null
                            },
                        )
                    }
                }
                .onFailure { e ->
                    if (!silent) {
                        _state.update {
                            it.copy(
                                detailLoading = false,
                                detailError = e.toApiException().message,
                            )
                        }
                    }
                }
        }
    }

    fun closeDetail() = _state.update { it.copy(detail = null, detailError = null) }

    // ---- Lập biên bản mới ----

    fun openCreateForm() {
        _state.update {
            it.copy(
                showCreateForm = true,
                createError = null,
                selectedEmployee = null,
                formType = "written",
                formSeverity = "medium",
                formTitle = "",
                formDescription = "",
                formActionTaken = "",
                formIssuedDate = Format.today(),
            )
        }
        if (_state.value.employees.isEmpty()) loadEmployees()
    }

    fun closeCreateForm() =
        _state.update { it.copy(showCreateForm = false, createError = null) }

    fun openEmployeePicker() {
        _state.update { it.copy(showEmployeePicker = true) }
        if (_state.value.employees.isEmpty()) loadEmployees()
    }

    fun closeEmployeePicker() = _state.update { it.copy(showEmployeePicker = false) }

    fun selectEmployee(employee: DisciplinaryEmployeeDto) {
        _state.update {
            it.copy(
                selectedEmployee = employee,
                showEmployeePicker = false,
                createError = null,
            )
        }
    }

    fun onFormTypeChange(value: String) = _state.update { it.copy(formType = value) }
    fun onFormSeverityChange(value: String) = _state.update { it.copy(formSeverity = value) }
    fun onFormTitleChange(value: String) = _state.update { it.copy(formTitle = value, createError = null) }
    fun onFormDescriptionChange(value: String) = _state.update { it.copy(formDescription = value) }
    fun onFormActionTakenChange(value: String) = _state.update { it.copy(formActionTaken = value) }
    fun onFormIssuedDateChange(value: LocalDate) = _state.update { it.copy(formIssuedDate = value) }

    private fun loadEmployees() {
        if (_state.value.employeesLoading) return
        _state.update { it.copy(employeesLoading = true) }
        viewModelScope.launch {
            runCatching { api.getEmployees() }
                .onSuccess { resp ->
                    _state.update { st ->
                        st.copy(
                            employeesLoading = false,
                            employees = (resp.data ?: emptyList())
                                .filter { emp -> emp.id != null },
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            employeesLoading = false,
                            createError = e.toApiException().message,
                        )
                    }
                }
        }
    }

    /** Lập biên bản: đúng contract web (employee_id, type, severity, title bắt buộc). */
    fun submitCreate() {
        val s = _state.value
        if (s.creating) return
        val employeeId = s.selectedEmployee?.id
        if (employeeId == null) {
            _state.update { it.copy(createError = "Chọn nhân viên bị kỷ luật.") }
            return
        }
        val title = s.formTitle.trim()
        if (title.isBlank()) {
            _state.update { it.copy(createError = "Tiêu đề biên bản không được để trống.") }
            return
        }
        if (title.length > 200) {
            _state.update { it.copy(createError = "Tiêu đề tối đa 200 ký tự.") }
            return
        }
        _state.update { it.copy(creating = true, createError = null) }
        viewModelScope.launch {
            runCatching {
                api.createRecord(
                    CreateDisciplinaryRequest(
                        employeeId = employeeId,
                        type = s.formType,
                        severity = s.formSeverity,
                        title = title,
                        description = s.formDescription.trim().ifBlank { null },
                        actionTaken = s.formActionTaken.trim().ifBlank { null },
                        issuedDate = s.formIssuedDate.toString(),
                    )
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        creating = false,
                        showCreateForm = false,
                        selectedEmployee = null,
                        formTitle = "",
                        formDescription = "",
                        formActionTaken = "",
                        message = "Đã lập biên bản kỷ luật.",
                    )
                }
                fetchRecords()
            }.onFailure { e ->
                _state.update {
                    it.copy(creating = false, createError = e.toApiException().message)
                }
            }
        }
    }

    // ---- Giải quyết biên bản ----

    fun openResolve(record: DisciplinaryRecordDto) {
        _state.update {
            it.copy(resolvingRecord = record, resolvedNote = "", resolveError = null)
        }
    }

    fun closeResolve() =
        _state.update { it.copy(resolvingRecord = null, resolveError = null) }

    fun onResolvedNoteChange(value: String) =
        _state.update { it.copy(resolvedNote = value, resolveError = null) }

    /** Giải quyết: POST { resolved_note } — active -> resolved (đã giải quyết -> 409). */
    fun submitResolve() {
        val record = _state.value.resolvingRecord ?: return
        val recordId = record.id ?: return
        if (_state.value.resolving) return
        _state.update { it.copy(resolving = true, resolveError = null) }
        viewModelScope.launch {
            runCatching {
                api.resolveRecord(
                    recordId,
                    ResolveDisciplinaryRequest(
                        resolvedNote = _state.value.resolvedNote.trim().ifBlank { null },
                    ),
                )
            }.onSuccess { resp ->
                _state.update {
                    it.copy(
                        resolving = false,
                        resolvingRecord = null,
                        resolvedNote = "",
                        detail = resp.data ?: it.detail,
                        message = "Đã giải quyết biên bản kỷ luật.",
                    )
                }
                fetchRecords()
            }.onFailure { e ->
                _state.update {
                    it.copy(resolving = false, resolveError = e.toApiException().message)
                }
            }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: DisciplinaryApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            DisciplinaryViewModel(api, sessionStore) as T
    }

    companion object {
        /** WRITE_ROLES phía web (routes.py): chỉ admin/hr được tạo + giải quyết. */
        private val WRITE_ROLES = setOf("admin", "hr")
    }
}
