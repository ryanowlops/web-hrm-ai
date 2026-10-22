package com.hrmai.app.feature.documents

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.datastore.SessionStore
import com.hrmai.app.core.network.toApiException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DocumentsUiState(
    /** 0 = Tài liệu của tôi, 1 = Giấy xác nhận, 2 = Duyệt giấy (HR/Admin). */
    val tab: Int = 0,
    val role: String? = null,
    val myEmployeeId: Int? = null,
    /** Chỉ hr/admin được duyệt giấy xác nhận (server WRITE_ROLES). */
    val canDecide: Boolean = false,
    // Tài liệu của tôi
    val documents: List<DocumentDto> = emptyList(),
    val docsLoading: Boolean = true,
    val docsError: String? = null,
    val docsRefreshing: Boolean = false,
    // Giấy xác nhận của tôi
    val myCerts: List<CertificateDto> = emptyList(),
    val certsLoading: Boolean = true,
    val certsError: String? = null,
    val certsRefreshing: Boolean = false,
    // Hàng đợi duyệt giấy (HR/Admin)
    val queue: List<CertificateDto> = emptyList(),
    val queueLoading: Boolean = false,
    val queueError: String? = null,
    val queueRefreshing: Boolean = false,
    // Form xin giấy xác nhận
    val formCertType: String = "employment",
    val formPurpose: String = "",
    val formError: String? = null,
    val submitting: Boolean = false,
    /** Bật đúng một nhịp khi gửi yêu cầu thành công (để đóng hộp thoại). */
    val submitted: Boolean = false,
    /** Id yêu cầu giấy đang được duyệt. */
    val actingId: Int? = null,
    val message: String? = null,
)

class DocumentsViewModel(
    private val api: DocumentsApi,
    private val sessionStore: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(DocumentsUiState())
    val state: StateFlow<DocumentsUiState> = _state

    init {
        viewModelScope.launch {
            sessionStore.sessionFlow.collect { session ->
                val role = session?.user?.role
                val employeeId = session?.user?.employeeId
                if (_state.value.role != role ||
                    _state.value.myEmployeeId != employeeId
                ) {
                    _state.update {
                        it.copy(
                            role = role,
                            myEmployeeId = employeeId,
                            canDecide = role in DECIDE_ROLES,
                        )
                    }
                    loadDocuments()
                    if (role in DECIDE_ROLES) loadQueue()
                }
            }
        }
        loadMyCerts()
    }

    // ------------------------------------------------------------------
    // Tài liệu của tôi — truyền employee_id của chính mình để tab này
    // luôn chỉ chứa hồ sơ cá nhân (kể cả với HR/Admin).
    // ------------------------------------------------------------------
    fun loadDocuments() {
        viewModelScope.launch {
            _state.update { it.copy(docsLoading = true, docsError = null) }
            fetchDocuments()
        }
    }

    private suspend fun fetchDocuments() {
        runCatching {
            api.getDocuments(
                employeeId = _state.value.myEmployeeId,
                page = 1,
                limit = 100,
            )
        }.onSuccess { resp ->
            _state.update {
                it.copy(
                    documents = resp.data ?: emptyList(),
                    docsLoading = false,
                    docsError = null,
                )
            }
        }.onFailure { e ->
            _state.update {
                it.copy(docsLoading = false, docsError = e.toApiException().message)
            }
        }
    }

    fun refreshDocuments() {
        if (_state.value.docsRefreshing) return
        viewModelScope.launch {
            _state.update { it.copy(docsRefreshing = true) }
            fetchDocuments()
            _state.update { it.copy(docsRefreshing = false) }
        }
    }

    // ------------------------------------------------------------------
    // Giấy xác nhận của tôi
    // ------------------------------------------------------------------
    fun loadMyCerts() {
        viewModelScope.launch {
            _state.update { it.copy(certsLoading = true, certsError = null) }
            fetchMyCerts()
        }
    }

    private suspend fun fetchMyCerts() {
        runCatching {
            api.getCertificates(scope = "mine", status = null, page = 1, limit = 50)
        }.onSuccess { resp ->
            _state.update {
                it.copy(
                    myCerts = resp.data ?: emptyList(),
                    certsLoading = false,
                    certsError = null,
                )
            }
        }.onFailure { e ->
            _state.update {
                it.copy(certsLoading = false, certsError = e.toApiException().message)
            }
        }
    }

    fun refreshMyCerts() {
        if (_state.value.certsRefreshing) return
        viewModelScope.launch {
            _state.update { it.copy(certsRefreshing = true) }
            fetchMyCerts()
            _state.update { it.copy(certsRefreshing = false) }
        }
    }

    // ------------------------------------------------------------------
    // Hàng đợi duyệt giấy (HR/Admin): toàn công ty, status=pending.
    // ------------------------------------------------------------------
    fun loadQueue() {
        val s = _state.value
        if (!s.canDecide || s.queueLoading) return
        viewModelScope.launch {
            _state.update { it.copy(queueLoading = true, queueError = null) }
            fetchQueue()
        }
    }

    private suspend fun fetchQueue() {
        runCatching {
            api.getCertificates(scope = null, status = "pending", page = 1, limit = 50)
        }.onSuccess { resp ->
            _state.update {
                it.copy(
                    queue = resp.data ?: emptyList(),
                    queueLoading = false,
                    queueError = null,
                )
            }
        }.onFailure { e ->
            _state.update {
                it.copy(queueLoading = false, queueError = e.toApiException().message)
            }
        }
    }

    fun refreshQueue() {
        if (_state.value.queueRefreshing || !_state.value.canDecide) return
        viewModelScope.launch {
            _state.update { it.copy(queueRefreshing = true, queueError = null) }
            fetchQueue()
            _state.update { it.copy(queueRefreshing = false) }
        }
    }

    // ------------------------------------------------------------------
    // Tab + form xin giấy
    // ------------------------------------------------------------------
    fun selectTab(index: Int) {
        if (index == 2 && !_state.value.canDecide) return
        _state.update { it.copy(tab = index) }
        if (index == 2) loadQueue()
    }

    fun setFormCertType(type: String) =
        _state.update { it.copy(formCertType = type, formError = null) }

    fun setFormPurpose(text: String) =
        _state.update { it.copy(formPurpose = text, formError = null) }

    fun submitCertificate() {
        val s = _state.value
        if (s.submitting) return
        val error = when {
            s.formCertType !in CERT_TYPES ->
                "Chọn loại giấy xác nhận nhé."
            s.formPurpose.isBlank() ->
                "Nhập mục đích xin giấy giúp em nhé (server yêu cầu)."
            s.formPurpose.trim().length > 1000 ->
                "Mục đích tối đa 1000 ký tự."
            else -> null
        }
        if (error != null) {
            _state.update { it.copy(formError = error) }
            return
        }
        _state.update { it.copy(submitting = true, formError = null) }
        viewModelScope.launch {
            runCatching {
                api.createCertificate(
                    CreateCertificateBody(
                        certType = s.formCertType,
                        purpose = s.formPurpose.trim(),
                    ),
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        submitting = false,
                        submitted = true,
                        formPurpose = "",
                        message = "Đã gửi yêu cầu cấp giấy, HR sẽ xử lý sớm nhé.",
                    )
                }
                fetchMyCerts()
            }.onFailure { e ->
                _state.update {
                    it.copy(submitting = false, formError = e.toApiException().message)
                }
            }
        }
    }

    fun consumeSubmitted() = _state.update { it.copy(submitted = false) }

    /** Duyệt giấy 1 cấp: body decision là "approve" | "reject" (đúng
     *  validate của documents), note tuỳ chọn ở cả hai trường hợp. */
    fun decide(cert: CertificateDto, approved: Boolean, note: String) {
        val id = cert.id ?: return
        if (_state.value.actingId != null) return
        _state.update { it.copy(actingId = id) }
        viewModelScope.launch {
            runCatching {
                api.decideCertificate(
                    id,
                    CertificateDecisionBody(
                        decision = if (approved) "approve" else "reject",
                        note = note.trim().ifBlank { null },
                    ),
                )
            }.onSuccess {
                _state.update {
                    it.copy(
                        actingId = null,
                        message = if (approved) {
                            "Đã duyệt cấp giấy xác nhận."
                        } else {
                            "Đã từ chối yêu cầu cấp giấy."
                        },
                    )
                }
                fetchQueue()
                fetchMyCerts()
            }.onFailure { e ->
                _state.update {
                    it.copy(actingId = null, message = e.toApiException().message)
                }
            }
        }
    }

    fun consumeMessage() = _state.update { it.copy(message = null) }

    class Factory(
        private val api: DocumentsApi,
        private val sessionStore: SessionStore,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            DocumentsViewModel(api, sessionStore) as T
    }

    companion object {
        private val DECIDE_ROLES = setOf("hr", "admin")
        private val CERT_TYPES = setOf("salary", "employment")
    }
}
