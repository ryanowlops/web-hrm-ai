package com.hrmai.app.feature.orgchart

import com.hrmai.app.feature.departments.DepartmentsApi
import com.hrmai.app.feature.employees.EmployeesApi

/**
 * Server không có endpoint sơ đồ tổ chức riêng: màn này dựng cây ở client
 * từ 2 nguồn sẵn có (giống cách bản web gộp dữ liệu):
 * - GET employees (phạm vi theo vai trò ở server) — trường manager_id cho
 *   quan hệ quản lý trực tiếp, department_id để nhóm theo phòng.
 * - GET org/departments — trường manager_id ở cấp phòng = trưởng phòng.
 *
 * Interface này chỉ KẾ THỪA 2 API gốc (không override) để dùng lại đúng
 * DTO + annotation + tham số mặc định của chúng; Retrofit đọc được các
 * phương thức kế thừa bình thường.
 */
interface OrgChartApi : EmployeesApi, DepartmentsApi
