// Trang Phòng ban & Chức vụ — route /departments
// Danh sách phòng ban (trưởng phòng, số nhân viên) và các chức vụ thuộc
// từng phòng. CRUD chỉ hiển thị với admin / hr (server vẫn kiểm tra quyền).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getPositions,
  createPosition,
  updatePosition,
  deletePosition,
  parseApiError,
} from '../services';
import { getEmployees } from '../../employees/services';

function getCurrentRole() {
  try {
    const raw = localStorage.getItem('user') || localStorage.getItem('currentUser');
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.role) return u.role;
    }
    const token = localStorage.getItem('hrm_access_token') || localStorage.getItem('accessToken') || localStorage.getItem('access_token');
    if (token && token.split('.').length === 3) {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role) return payload.role;
    }
  } catch {
    /* bỏ qua */
  }
  return null;
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Đóng">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, error, required = false, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}

const inputClass = (hasError) =>
  `w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
    hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-indigo-400 focus:ring-indigo-200'
  }`;

function FormActions({ onCancel, submitting, submitLabel }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
        Huỷ
      </button>
      <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
        {submitting ? 'Đang lưu...' : submitLabel}
      </button>
    </div>
  );
}

// ---------- Form phòng ban ----------

function DepartmentForm({ initial, employees, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    manager_id: initial?.manager_id ? String(initial.manager_id) : '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Vui lòng nhập tên phòng ban.';
    else if (form.name.trim().length < 2) errs.name = 'Tên phòng ban phải có ít nhất 2 ký tự.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      await onSubmit({
        name: form.name.trim(),
        manager_id: form.manager_id ? Number(form.manager_id) : null,
      });
    } catch (err) {
      const { message, fieldErrors } = parseApiError(err, 'Không lưu được phòng ban.');
      setFormError(message);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
      <Field label="Tên phòng ban" required error={errors.name}>
        <input
          className={inputClass(errors.name)}
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors((p) => ({ ...p, name: undefined })); }}
          placeholder="VD: Phòng Kỹ thuật"
        />
      </Field>
      <Field label="Trưởng phòng">
        <select
          className={inputClass(false)}
          value={form.manager_id}
          onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value }))}
        >
          <option value="">— Chưa gán —</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.code})</option>
          ))}
        </select>
      </Field>
      <FormActions onCancel={onCancel} submitting={submitting} submitLabel={initial ? 'Lưu thay đổi' : 'Thêm phòng ban'} />
    </form>
  );
}

// ---------- Form chức vụ ----------

function PositionForm({ initial, departments, defaultDepartmentId, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    department_id: initial?.department_id ? String(initial.department_id) : (defaultDepartmentId ? String(defaultDepartmentId) : ''),
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.title.trim()) errs.title = 'Vui lòng nhập tên chức vụ.';
    else if (form.title.trim().length < 2) errs.title = 'Tên chức vụ phải có ít nhất 2 ký tự.';
    if (!form.department_id) errs.department_id = 'Vui lòng chọn phòng ban.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      await onSubmit({ title: form.title.trim(), department_id: Number(form.department_id) });
    } catch (err) {
      const { message, fieldErrors } = parseApiError(err, 'Không lưu được chức vụ.');
      setFormError(message);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
      <Field label="Tên chức vụ" required error={errors.title}>
        <input
          className={inputClass(errors.title)}
          value={form.title}
          onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); setErrors((p) => ({ ...p, title: undefined })); }}
          placeholder="VD: Lập trình viên"
        />
      </Field>
      <Field label="Phòng ban" required error={errors.department_id}>
        <select
          className={inputClass(errors.department_id)}
          value={form.department_id}
          onChange={(e) => { setForm((f) => ({ ...f, department_id: e.target.value })); setErrors((p) => ({ ...p, department_id: undefined })); }}
        >
          <option value="">— Chọn phòng ban —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </Field>
      <FormActions onCancel={onCancel} submitting={submitting} submitLabel={initial ? 'Lưu thay đổi' : 'Thêm chức vụ'} />
    </form>
  );
}

// ---------- Trang chính ----------

export default function DepartmentListPage() {
  const { user } = useAuth();
  const fallbackRole = useMemo(getCurrentRole, []);
  const role = user?.role || fallbackRole;
  const canWrite = role === 'admin' || role === 'hr';

  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [deptTarget, setDeptTarget] = useState(null); // null | 'create' | department
  const [posTarget, setPosTarget] = useState(null); // null | { position?: object, departmentId?: number }
  const [deleteDept, setDeleteDept] = useState(null);
  const [deletePos, setDeletePos] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [deps, poss, emps] = await Promise.all([
        getDepartments({ limit: 100 }),
        getPositions({ limit: 100 }).catch(() => ({ items: [] })),
        getEmployees({ limit: 100 }).catch(() => ({ items: [] })),
      ]);
      setDepartments(deps.items);
      setPositions(poss.items);
      setEmployees(emps.items);
    } catch (err) {
      setError(parseApiError(err, 'Không tải được danh sách phòng ban.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const employeeCount = useCallback(
    (dept) => {
      if (typeof dept.employee_count === 'number') return dept.employee_count;
      if (typeof dept.employees_count === 'number') return dept.employees_count;
      return employees.filter((e) => e.department_id === dept.id).length;
    },
    [employees],
  );

  const managerName = (dept) =>
    dept.manager?.full_name
    || employees.find((e) => e.id === dept.manager_id)?.full_name
    || 'Chưa gán';

  const positionsOf = (deptId) => positions.filter((p) => p.department_id === deptId);

  const handleSaveDept = async (payload) => {
    setSubmitting(true);
    try {
      if (deptTarget === 'create') {
        await createDepartment(payload);
        setNotice('Đã thêm phòng ban mới.');
      } else {
        await updateDepartment(deptTarget.id, payload);
        setNotice('Đã cập nhật phòng ban.');
      }
      setDeptTarget(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePos = async (payload) => {
    setSubmitting(true);
    try {
      if (posTarget.position) {
        await updatePosition(posTarget.position.id, payload);
        setNotice('Đã cập nhật chức vụ.');
      } else {
        await createPosition(payload);
        setNotice('Đã thêm chức vụ mới.');
      }
      setPosTarget(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDept = async () => {
    if (!deleteDept) return;
    setSubmitting(true);
    try {
      await deleteDepartment(deleteDept.id);
      setNotice(`Đã xóa phòng ban ${deleteDept.name}.`);
      setDeleteDept(null);
      await load();
    } catch (err) {
      // Phòng ban còn nhân viên sẽ bị server chặn (409) — hiện đúng thông báo của server.
      setError(parseApiError(err, 'Không xóa được phòng ban. Phòng ban còn nhân viên thì phải chuyển nhân viên sang phòng khác trước.').message);
      setDeleteDept(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePos = async () => {
    if (!deletePos) return;
    setSubmitting(true);
    try {
      await deletePosition(deletePos.id);
      setNotice(`Đã xóa chức vụ ${deletePos.title}.`);
      setDeletePos(null);
      await load();
    } catch (err) {
      setError(parseApiError(err, 'Không xóa được chức vụ.').message);
      setDeletePos(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Phòng ban & Chức vụ</h1>
          <p className="text-sm text-slate-500">Cơ cấu tổ chức công ty — {departments.length} phòng ban, {positions.length} chức vụ</p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPosTarget({})}
              className="rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50"
            >
              + Thêm chức vụ
            </button>
            <button
              type="button"
              onClick={() => setDeptTarget('create')}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
            >
              + Thêm phòng ban
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">Đang tải dữ liệu...</div>
      ) : departments.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">
          Chưa có phòng ban nào. {canWrite && 'Hãy bấm "Thêm phòng ban" để tạo cơ cấu tổ chức.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((dept) => (
            <article key={dept.id} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{dept.name}</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Trưởng phòng: <span className="font-medium text-slate-600">{managerName(dept)}</span>
                  </p>
                  <p className="text-sm text-slate-500">{employeeCount(dept)} nhân viên</p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setDeptTarget(dept)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50">
                      Sửa
                    </button>
                    <button type="button" onClick={() => setDeleteDept(dept)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                      Xóa
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Chức vụ trong phòng</p>
                {positionsOf(dept.id).length === 0 ? (
                  <p className="text-sm text-slate-400">Chưa có chức vụ nào.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {positionsOf(dept.id).map((pos) => (
                      <li key={pos.id} className="group inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-2 text-sm text-slate-700">
                        {pos.title}
                        {canWrite && (
                          <>
                            <button
                              type="button"
                              onClick={() => setPosTarget({ position: pos })}
                              className="rounded-full px-1 text-xs text-indigo-500 opacity-0 transition group-hover:opacity-100 hover:text-indigo-700"
                              title="Sửa chức vụ"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletePos(pos)}
                              className="rounded-full px-1 text-xs text-red-500 opacity-0 transition group-hover:opacity-100 hover:text-red-700"
                              title="Xóa chức vụ"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => setPosTarget({ departmentId: dept.id })}
                    className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    + Thêm chức vụ vào phòng này
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Modal phòng ban */}
      {deptTarget && (
        <Modal title={deptTarget === 'create' ? 'Thêm phòng ban' : `Sửa phòng ban — ${deptTarget.name}`} onClose={() => setDeptTarget(null)}>
          <DepartmentForm
            initial={deptTarget === 'create' ? null : deptTarget}
            employees={employees}
            submitting={submitting}
            onCancel={() => setDeptTarget(null)}
            onSubmit={handleSaveDept}
          />
        </Modal>
      )}

      {/* Modal chức vụ */}
      {posTarget && (
        <Modal title={posTarget.position ? `Sửa chức vụ — ${posTarget.position.title}` : 'Thêm chức vụ'} onClose={() => setPosTarget(null)}>
          <PositionForm
            initial={posTarget.position || null}
            departments={departments}
            defaultDepartmentId={posTarget.departmentId}
            submitting={submitting}
            onCancel={() => setPosTarget(null)}
            onSubmit={handleSavePos}
          />
        </Modal>
      )}

      {/* Modal xác nhận xóa phòng ban */}
      {deleteDept && (
        <Modal title="Xóa phòng ban" onClose={() => !submitting && setDeleteDept(null)}>
          <p className="text-sm text-slate-600">
            Anh/chị có chắc muốn xóa <strong>{deleteDept.name}</strong>?
            Phòng ban đang có nhân viên hoặc chức vụ sẽ không xóa được — hệ thống sẽ yêu cầu chuyển nhân viên sang phòng khác trước.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteDept(null)} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Huỷ
            </button>
            <button type="button" onClick={handleDeleteDept} disabled={submitting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60">
              {submitting ? 'Đang xóa...' : 'Xóa phòng ban'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal xác nhận xóa chức vụ */}
      {deletePos && (
        <Modal title="Xóa chức vụ" onClose={() => !submitting && setDeletePos(null)}>
          <p className="text-sm text-slate-600">
            Anh/chị có chắc muốn xóa chức vụ <strong>{deletePos.title}</strong>?
            Nhân viên đang giữ chức vụ này sẽ cần được gán lại chức vụ khác.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setDeletePos(null)} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Huỷ
            </button>
            <button type="button" onClick={handleDeletePos} disabled={submitting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60">
              {submitting ? 'Đang xóa...' : 'Xóa chức vụ'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
