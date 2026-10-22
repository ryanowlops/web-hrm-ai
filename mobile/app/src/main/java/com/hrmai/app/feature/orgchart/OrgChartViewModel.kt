package com.hrmai.app.feature.orgchart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.hrmai.app.core.network.toApiException
import com.hrmai.app.feature.departments.DepartmentDto
import com.hrmai.app.feature.employees.EmployeeDto
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Một nút trong cây báo cáo: nhân viên + cấp độ thụt + vai trò trưởng phòng. */
data class OrgNode(
    val employee: EmployeeDto,
    val depth: Int,
    val isDepartmentHead: Boolean,
)

/** Khối hiển thị: một phòng ban và cây báo cáo bên trong. */
data class OrgDepartmentBlock(
    val department: DepartmentDto?,
    val nodes: List<OrgNode>,
)

data class OrgChartUiState(
    val blocks: List<OrgDepartmentBlock> = emptyList(),
    val totalEmployees: Int = 0,
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val forbidden: Boolean = false,
)

class OrgChartViewModel(
    private val api: OrgChartApi,
) : ViewModel() {

    private val _state = MutableStateFlow(OrgChartUiState())
    val state: StateFlow<OrgChartUiState> = _state

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, forbidden = false) }
            fetch()
        }
    }

    fun refresh() {
        if (_state.value.refreshing) return
        viewModelScope.launch {
            _state.update { it.copy(refreshing = true) }
            fetch()
            _state.update { it.copy(refreshing = false) }
        }
    }

    private suspend fun fetch() {
        runCatching {
            val employeesDeferred = viewModelScope.async { fetchAllEmployees() }
            val departmentsDeferred = viewModelScope.async { fetchAllDepartments() }
            val employees = employeesDeferred.await()
            val departments = departmentsDeferred.await()
            buildBlocks(employees, departments) to employees.size
        }.onSuccess { (blocks, total) ->
            _state.update {
                it.copy(
                    blocks = blocks,
                    totalEmployees = total,
                    loading = false,
                    error = null,
                    forbidden = false,
                )
            }
        }.onFailure { e ->
            val apiError = e.toApiException()
            _state.update {
                it.copy(
                    loading = false,
                    error = apiError.message,
                    forbidden = apiError.httpStatus == 403,
                )
            }
        }
    }

    private suspend fun fetchAllEmployees(): List<EmployeeDto> {
        val all = mutableListOf<EmployeeDto>()
        var page = 1
        var totalPages = 1
        do {
            val resp = api.getEmployees(
                search = null,
                departmentId = null,
                status = null,
                page = page,
                limit = PAGE_LIMIT,
            )
            all += resp.data ?: emptyList()
            totalPages = resp.meta?.totalPages ?: 1
            page++
        } while (page <= totalPages)
        // Bỏ người đã nghỉ việc cho sơ đồ gọn, giống bản web.
        return all.filter { it.status != "resigned" }
    }

    private suspend fun fetchAllDepartments(): List<DepartmentDto> {
        val all = mutableListOf<DepartmentDto>()
        var page = 1
        var totalPages = 1
        do {
            val resp = api.getDepartments(page = page, limit = PAGE_LIMIT)
            all += resp.data ?: emptyList()
            totalPages = resp.meta?.totalPages ?: 1
            page++
        } while (page <= totalPages)
        return all
    }

    /**
     * Dựng cây báo cáo theo từng phòng:
     * - Gốc của phòng: trưởng phòng (departments.manager_id) nếu có trong
     *   phạm vi dữ liệu; không có thì là các nhân viên không có quản lý
     *   hoặc quản lý nằm ngoài phòng/phạm vi.
     * - Con: nhân viên có manager_id trỏ vào nút cha (chỉ trong cùng phòng).
     * - Chống vòng lặp bằng tập đã thăm; nút sót lại (do vòng lặp dữ liệu)
     *   được gắn ở cuối phòng với cấp gốc.
     */
    private fun buildBlocks(
        employees: List<EmployeeDto>,
        departments: List<DepartmentDto>,
    ): List<OrgDepartmentBlock> {
        val deptById = departments.associateBy { it.id }
        val grouped = employees.groupBy { it.departmentId }
        val blocks = mutableListOf<OrgDepartmentBlock>()

        val orderedDeptIds = departments.mapNotNull { it.id } + (grouped.keys - deptById.keys)
        for (deptId in orderedDeptIds.distinct()) {
            val members = grouped[deptId].orEmpty()
            if (members.isEmpty()) continue
            val department = deptById[deptId]
            blocks += OrgDepartmentBlock(
                department = department,
                nodes = buildTree(members, department?.managerId),
            )
        }
        // Nhân viên chưa thuộc phòng ban nào.
        val noDept = grouped[null].orEmpty()
        if (noDept.isNotEmpty()) {
            blocks += OrgDepartmentBlock(
                department = null,
                nodes = buildTree(noDept, null),
            )
        }
        return blocks
    }

    private fun buildTree(members: List<EmployeeDto>, headId: Int?): List<OrgNode> {
        val byId = members.associateBy { it.id }
        val childrenOf = members
            .filter { it.managerId != null && byId.containsKey(it.managerId) && it.managerId != it.id }
            .groupBy { it.managerId }

        val roots = members.filter { member ->
            val managerId = member.managerId
            managerId == null || !byId.containsKey(managerId) || managerId == member.id
        }.sortedWith(compareBy({ it.id != headId }, { it.fullName ?: "" }))

        val nodes = mutableListOf<OrgNode>()
        val visited = mutableSetOf<Int>()

        fun walk(employee: EmployeeDto, depth: Int) {
            val id = employee.id ?: return
            if (!visited.add(id)) return
            nodes += OrgNode(employee, depth, isDepartmentHead = id == headId)
            childrenOf[id].orEmpty()
                .sortedBy { it.fullName ?: "" }
                .forEach { child -> walk(child, depth + 1) }
        }

        roots.forEach { walk(it, 0) }
        // Nút chưa thăm (vòng lặp manager_id): gắn phẳng ở cuối, cấp 0.
        members.filter { it.id != null && it.id !in visited }
            .sortedBy { it.fullName ?: "" }
            .forEach { employee ->
                nodes += OrgNode(employee, 0, isDepartmentHead = employee.id == headId)
            }
        return nodes
    }

    class Factory(
        private val api: OrgChartApi,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            OrgChartViewModel(api) as T
    }

    companion object {
        private const val PAGE_LIMIT = 100
    }
}
