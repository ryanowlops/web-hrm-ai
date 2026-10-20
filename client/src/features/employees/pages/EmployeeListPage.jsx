// Trang danh sách nhân viên — route /employees
// Bảng phân trang, tìm kiếm, lọc phòng ban / trạng thái.
// Thao tác ghi (thêm / sửa / xóa) chỉ hiển thị với vai trò admin và hr
// (ẩn nút chỉ là trải nghiệm — server vẫn kiểm tra quyền thật, xem B8).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  parseApiError,
} from '../services';
import { getDepartments, getPositions } from '../../departments/services';

const STATUS_OPTIONS = [
  { value: 'working', label: 'Đang làm việc' },
  { value: 'on_leave', label: 'Đang nghỉ phép' },
  { value: 'resigned', label: 'Đã nghỉ việc' },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));
const STATUS_CLASS = {
  working: 'bg-emerald-100 text-emerald-700',
  on_leave: 'bg-amber-100 text-amber-700',
  resigned: 'bg-slate-200 text-slate-600',
};
const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
];

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
    /* bỏ qua — mặc định không có quyền ghi */
  }
  return null;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase() || 'NV';
}

// ---------- UI dùng cục bộ (components/ui.jsx chưa có nên khai báo tại đây) ----------

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className={`my-8 w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl bg-white p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Đóng">
            ✕
          </button>
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

// ---------- Form thêm / sửa nhân viên ----------

function validateEmployee(form, isCreate) {
  const errors = {};
  if (isCreate) {
    if (!form.code.trim()) errors.code = 'Vui lòng nhập mã nhân viên.';
    else if (form.code.trim().length < 2) errors.code = 'Mã nhân viên phải có ít nhất 2 ký tự.';
  }
  if (!form.full_name.trim()) errors.full_name = 'Vui lòng nhập họ tên nhân viên.';
  else if (form.full_name.trim().length < 2) errors.full_name = 'Họ tên quá ngắn.';
  if (!form.email.trim()) errors.email = 'Vui lòng nhập email.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Email không đúng định dạng.';
  if (form.phone && !/^0\d{9}$/.test(form.phone.trim())) errors.phone = 'Số điện thoại phải gồm 10 số và bắt đầu bằng 0.';
  if (!form.department_id) errors.department_id = 'Vui lòng chọn phòng ban.';
  if (!form.start_date) errors.start_date = 'Vui lòng chọn ngày vào làm.';
  if (form.date_of_birth && form.start_date && form.date_of_birth >= form.start_date) {
    errors.date_of_birth = 'Ngày sinh phải trước ngày vào làm.';
  }
  return errors;
}

function EmployeeForm({ initial, departments, positions, employees, onSubmit, onCancel, submitting }) {
  const isCreate = !initial;
  const [form, setForm] = useState(() => ({
    code: initial?.code || '',
    full_name: initial?.full_name || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    date_of_birth: initial?.date_of_birth ? initial.date_of_birth.slice(0, 10) : '',
    gender: initial?.gender || 'male',
    address: initial?.address || '',
    department_id: initial?.department_id ? String(initial.department_id) : '',
    position_id: initial?.position_id ? String(initial.position_id) : '',
    manager_id: initial?.manager_id ? String(initial.manager_id) : '',
    start_date: initial?.start_date ? initial.start_date.slice(0, 10) : '',
    status: initial?.status || 'working',
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'department_id') next.position_id = '';
      return next;
    });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const positionOptions = useMemo(
    () => positions.filter((p) => !form.department_id || String(p.department_id) === form.department_id),
    [positions, form.department_id],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validateEmployee(form, isCreate);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender,
      address: form.address.trim() || null,
      department_id: Number(form.department_id),
      position_id: form.position_id ? Number(form.position_id) : null,
      manager_id: form.manager_id ? Number(form.manager_id) : null,
      start_date: form.start_date,
    };
    if (isCreate) payload.code = form.code.trim();
    else payload.status = form.status;
    try {
      await onSubmit(payload);
    } catch (err) {
      const { message, fieldErrors } = parseApiError(err, 'Không lưu được nhân viên.');
      setFormError(message);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {formError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{formError}</div>}
      {isCreate && (
        <Field label="Mã nhân viên" required error={errors.code}>
          <input className={inputClass(errors.code)} value={form.code} onChange={set('code')} placeholder="VD: NV001" />
        </Field>
      )}
      <Field label="Họ tên" required error={errors.full_name}>
        <input className={inputClass(errors.full_name)} value={form.full_name} onChange={set('full_name')} placeholder="Nguyễn Văn A" />
      </Field>
      <Field label="Email" required error={errors.email}>
        <input type="email" className={inputClass(errors.email)} value={form.email} onChange={set('email')} placeholder="ten@congty.vn" />
      </Field>
      <Field label="Số điện thoại" error={errors.phone}>
        <input className={inputClass(errors.phone)} value={form.phone} onChange={set('phone')} placeholder="09xxxxxxxx" />
      </Field>
      <Field label="Ngày sinh" error={errors.date_of_birth}>
        <input type="date" className={inputClass(errors.date_of_birth)} value={form.date_of_birth} onChange={set('date_of_birth')} />
      </Field>
      <Field label="Giới tính">
        <select className={inputClass(false)} value={form.gender} onChange={set('gender')}>
          {GENDER_OPTIONS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Ngày vào làm" required error={errors.start_date}>
        <input type="date" className={inputClass(errors.start_date)} value={form.start_date} onChange={set('start_date')} />
      </Field>
      <Field label="Phòng ban" required error={errors.department_id}>
        <select className={inputClass(errors.department_id)} value={form.department_id} onChange={set('department_id')}>
          <option value="">— Chọn phòng ban —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Chức vụ">
        <select className={inputClass(false)} value={form.position_id} onChange={set('position_id')}>
          <option value="">— Chưa gán —</option>
          {positionOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </Field>
      <Field label="Quản lý trực tiếp">
        <select className={inputClass(false)} value={form.manager_id} onChange={set('manager_id')}>
          <option value="">— Chưa gán —</option>
          {employees.filter((e) => e.id !== initial?.id).map((e) => (
            <option key={e.id} value={e.id}>{e.full_name} ({e.code})</option>
          ))}
        </select>
      </Field>
      {!isCreate && (
        <Field label="Trạng thái làm việc">
          <select className={inputClass(false)} value={form.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Địa chỉ">
        <input className={inputClass(false)} value={form.address} onChange={set('address')} placeholder="Số nhà, đường, quận/huyện, tỉnh/thành" />
      </Field>
      <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Huỷ
        </button>
        <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
          {submitting ? 'Đang lưu...' : isCreate ? 'Thêm nhân viên' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
}

// ---------- Trang danh sách ----------

export default function EmployeeListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fallbackRole = useMemo(getCurrentRole, []);
  const role = user?.role || fallbackRole;
  const canWrite = role === 'admin' || role === 'hr';

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [formTarget, setFormTarget] = useState(null); // null: đóng | 'create' | employee object
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 20, sortBy: 'full_name', sortOrder: 'asc' };
      if (search) params.search = search;
      if (departmentId) params.department_id = departmentId;
      if (status) params.status = status;
      const { items: rows, meta: m } = await getEmployees(params);
      setItems(rows);
      setMeta(m);
    } catch (err) {
      setError(parseApiError(err, 'Không tải được danh sách nhân viên.').message);
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [page, search, departmentId, status]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const [{ items: deps }, { items: pos }] = await Promise.all([
          getDepartments({ limit: 100 }),
          getPositions({ limit: 100 }).catch(() => ({ items: [] })),
        ]);
        setDepartments(deps);
        setPositions(pos);
      } catch {
        /* bộ lọc vẫn dùng được ở mức cơ bản */
      }
    })();
  }, []);

  // Debounce tìm kiếm 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const deptName = (emp) => emp.department?.name || emp.department_name || departments.find((d) => d.id === emp.department_id)?.name || '—';
  const posTitle = (emp) => emp.position?.title || emp.position_title || positions.find((p) => p.id === emp.position_id)?.title || '—';

  const handleSave = async (payload) => {
    setSubmitting(true);
    try {
      if (formTarget === 'create') {
        await createEmployee(payload);
        setNotice('Đã thêm nhân viên mới.');
      } else {
        await updateEmployee(formTarget.id, payload);
        setNotice('Đã cập nhật hồ sơ nhân viên.');
      }
      setFormTarget(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteEmployee(deleteTarget.id);
      setNotice(`Đã xóa nhân viên ${deleteTarget.full_name}.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(parseApiError(err, 'Không xóa được nhân viên.').message);
      setDeleteTarget(null);
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = meta?.totalPages || 1;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Nhân viên</h1>
          <p className="text-sm text-slate-500">
            {meta ? `Tổng cộng ${meta.totalItems} nhân viên` : 'Quản lý hồ sơ nhân viên toàn công ty'}
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setFormTarget('create')}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          >
            + Thêm nhân viên
          </button>
        )}
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {/* Bộ lọc */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-3">
        <input
          className={inputClass(false)}
          placeholder="Tìm theo tên, mã NV, email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className={inputClass(false)}
          value={departmentId}
          onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
        >
          <option value="">Tất cả phòng ban</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          className={inputClass(false)}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">Tất cả trạng thái</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Nhân viên</th>
              <th className="px-4 py-3">Phòng ban</th>
              <th className="px-4 py-3">Chức vụ</th>
              <th className="px-4 py-3">Ngày vào làm</th>
              <th className="px-4 py-3">Trạng thái</th>
              {canWrite && <th className="px-4 py-3 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={canWrite ? 6 : 5} className="px-4 py-10 text-center text-slate-400">Đang tải dữ liệu...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 6 : 5} className="px-4 py-10 text-center text-slate-400">
                  Chưa có nhân viên nào khớp bộ lọc. {canWrite && 'Hãy bấm "Thêm nhân viên" để bắt đầu.'}
                </td>
              </tr>
            )}
            {!loading && items.map((emp) => (
              <tr key={emp.id} className="border-b border-slate-50 transition hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {emp.avatar_url ? (
                      <img src={emp.avatar_url} alt={emp.full_name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600">
                        {initials(emp.full_name)}
                      </span>
                    )}
                    <div>
                      <Link to={`/employees/${emp.id}`} className="font-medium text-slate-800 hover:text-indigo-600">
                        {emp.full_name}
                      </Link>
                      <div className="text-xs text-slate-400">{emp.code} · {emp.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{deptName(emp)}</td>
                <td className="px-4 py-3 text-slate-600">{posTitle(emp)}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(emp.start_date)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[emp.status] || 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABEL[emp.status] || emp.status}
                  </span>
                </td>
                {canWrite && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => navigate(`/employees/${emp.id}`)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                        Chi tiết
                      </button>
                      <button type="button" onClick={() => setFormTarget(emp)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50">
                        Sửa
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(emp)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                        Xóa
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      {meta && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>Trang {meta.page} / {totalPages}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-white disabled:opacity-40"
            >
              ← Trước
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-white disabled:opacity-40"
            >
              Sau →
            </button>
          </div>
        </div>
      )}

      {/* Modal thêm / sửa */}
      {formTarget && (
        <Modal title={formTarget === 'create' ? 'Thêm nhân viên' : `Sửa hồ sơ — ${formTarget.full_name}`} onClose={() => setFormTarget(null)} wide>
          <EmployeeForm
            initial={formTarget === 'create' ? null : formTarget}
            departments={departments}
            positions={positions}
            employees={items}
            submitting={submitting}
            onCancel={() => setFormTarget(null)}
            onSubmit={handleSave}
          />
        </Modal>
      )}

      {/* Modal xác nhận xóa */}
      {deleteTarget && (
        <Modal title="Xóa nhân viên" onClose={() => !submitting && setDeleteTarget(null)}>
          <p className="text-sm text-slate-600">
            Anh/chị có chắc muốn xóa hồ sơ của <strong>{deleteTarget.full_name}</strong> ({deleteTarget.code})?
            Thao tác này không thể hoàn tác và có thể ảnh hưởng tới dữ liệu chấm công, nghỉ phép, lương đã gắn với nhân viên.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Huỷ
            </button>
            <button type="button" onClick={handleDelete} disabled={submitting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60">
              {submitting ? 'Đang xóa...' : 'Xóa nhân viên'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
