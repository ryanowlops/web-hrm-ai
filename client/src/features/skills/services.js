// Service layer cho module Bản đồ năng lực (Skills).
// File này ở client/src/features/skills/ nên api ở ../../api/axiosClient.
import axiosClient from '../../api/axiosClient';

function unwrap(res) {
  if (res && typeof res === 'object' && 'data' in res && ('status' in res || 'headers' in res)) {
    return res.data;
  }
  return res;
}

function unwrapMember(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body && body.data && typeof body.data === 'object') {
    return body.data;
  }
  return body;
}

function unwrapList(body) {
  if (Array.isArray(body)) return { items: body, meta: null };
  return { items: body?.data ?? [], meta: body?.meta ?? null };
}

// ---- Danh mục kỹ năng ----

export async function getSkills() {
  const res = await axiosClient.get('/skills');
  return unwrapList(unwrap(res));
}

export async function createSkill(payload) {
  const res = await axiosClient.post('/skills', payload);
  return unwrapMember(unwrap(res));
}

export async function updateSkill(id, payload) {
  const res = await axiosClient.patch(`/skills/${id}`, payload);
  return unwrapMember(unwrap(res));
}

export async function deleteSkill(id) {
  const res = await axiosClient.delete(`/skills/${id}`);
  return unwrap(res);
}

// ---- Ma trận kỹ năng × phòng ban ----

// Trả { departments: [{id, name}], rows: [{ skill, cells: { [deptId]: {avg_level, headcount} | null } }] }
export async function getMatrix() {
  const res = await axiosClient.get('/skills/matrix');
  return unwrapMember(unwrap(res));
}

// Trả { skill, department, employees: [{ employee_id, employee_code, employee_name, level }] }
export async function getMatrixCell(skillId, departmentId) {
  const res = await axiosClient.get('/skills/matrix/cell', {
    params: { skill_id: skillId, department_id: departmentId },
  });
  return unwrapMember(unwrap(res));
}

// ---- Hồ sơ kỹ năng theo nhân viên ----

// Trả { employee: {...}, items: [{ skill_id, skill_name, category, level }] }
export async function getEmployeeSkills(employeeId) {
  const res = await axiosClient.get(`/skills/employees/${employeeId}`);
  return unwrapMember(unwrap(res));
}

export async function updateEmployeeSkills(employeeId, items) {
  const res = await axiosClient.put(`/skills/employees/${employeeId}`, { items });
  return unwrapMember(unwrap(res));
}

// Trả { items: [{ skill, current_level, course: {id, title}, reason }], source: 'ai' | 'keyword' }
export async function suggestCourses(employeeId) {
  const res = await axiosClient.post(`/skills/employees/${employeeId}/suggest`);
  const body = unwrap(res);
  return { items: body?.data ?? [], source: body?.meta?.source ?? 'keyword' };
}

// Chuẩn hoá lỗi API { error: { code, message, details } } cho form.
export function parseApiError(err, fallback = 'Đã xảy ra lỗi, vui lòng thử lại.') {
  const apiError = err?.response?.data?.error;
  const result = { message: apiError?.message || fallback, fieldErrors: {} };
  const details = apiError?.details;
  if (Array.isArray(details)) {
    details.forEach((d) => {
      if (d && typeof d === 'object' && d.field) result.fieldErrors[d.field] = d.message || 'Dữ liệu không hợp lệ';
    });
  } else if (details && typeof details === 'object') {
    Object.entries(details).forEach(([field, msgs]) => {
      result.fieldErrors[field] = Array.isArray(msgs) ? msgs[0] : String(msgs);
    });
  }
  return result;
}
