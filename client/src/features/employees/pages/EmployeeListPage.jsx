// Trang danh sách nhân viên — route /employees
// Bảng phân trang, tìm kiếm, lọc phòng ban / trạng thái.
// Thao tác ghi (thêm / sửa / xóa) chỉ hiển thị với vai trò admin và hr
// (ẩn nút chỉ là trải nghiệm — server vẫn kiểm tra quyền thật, xem B8).
// Trình bày: design system v2 (UI kit trong src/components/ui + class .ui-*).
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
import {
  Button,
  Card,
  Badge,
  Modal,
  PageHeader,
  EmptyState,
  TableSkeleton,
  Alert,
  FormField,
  Input,
  Select,
} from '../../../components/ui';

const STATUS_OPTIONS = [
  { value: 'working', label: 'Đang làm việc' },
  { value: 'on_leave', label: 'Đang nghỉ phép' },
  { value: 'resigned', label: 'Đã nghỉ việc' },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));
const STATUS_TONE = {
  working: 'green',
  on_leave: 'amber',
  resigned: 'slate',
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

// Class bổ sung để ô nhập có lỗi hiển thị viền đỏ (trên nền .ui-input/.ui-select của kit).
const errCls = (hasError) =>
  hasError ? 'border-rose-400 hover:border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : '';

// Nhãn trường có dấu * bắt buộc (dùng với FormField của UI kit).
const reqLabel = (text) => (
  <>
    {text} <span className="text-rose-500">*</span>
  </>
);

const SearchIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const UsersIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

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
      {formError && (
        <Alert tone="error" className="sm:col-span-2">
          {formError}
        </Alert>
      )}
      {isCreate && (
        <FormField label={reqLabel('Mã nhân viên')} error={errors.code}>
          <Input className={errCls(errors.code)} value={form.code} onChange={set('code')} placeholder="VD: NV001" />
        </FormField>
      )}
      <FormField label={reqLabel('Họ tên')} error={errors.full_name}>
        <Input className={errCls(errors.full_name)} value={form.full_name} onChange={set('full_name')} placeholder="Nguyễn Văn A" />
      </FormField>
      <FormField label={reqLabel('Email')} error={errors.email}>
        <Input type="email" className={errCls(errors.email)} value={form.email} onChange={set('email')} placeholder="ten@congty.vn" />
      </FormField>
      <FormField label="Số điện thoại" error={errors.phone}>
        <Input className={errCls(errors.phone)} value={form.phone} onChange={set('phone')} placeholder="09xxxxxxxx" />
      </FormField>
      <FormField label="Ngày sinh" error={errors.date_of_birth}>
        <Input type="date" className={errCls(errors.date_of_birth)} value={form.date_of_birth} onChange={set('date_of_birth')} />
      </FormField>
      <FormField label="Giới tính">
        <Select value={form.gender} onChange={set('gender')}>
          {GENDER_OPTIONS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </Select>
      </FormField>
      <FormField label={reqLabel('Ngày vào làm')} error={errors.start_date}>
        <Input type="date" className={errCls(errors.start_date)} value={form.start_date} onChange={set('start_date')} />
      </FormField>
      <FormField label={reqLabel('Phòng ban')} error={errors.department_id}>
        <Select className={errCls(errors.department_id)} value={form.department_id} onChange={set('department_id')}>
          <option value="">— Chọn phòng ban —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Chức vụ">
        <Select value={form.position_id} onChange={set('position_id')}>
          <option value="">— Chưa gán —</option>
          {positionOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Quản lý trực tiếp">
        <Select value={form.manager_id} onChange={set('manager_id')}>
          <option value="">— Chưa gán —</option>
          {employees.filter((e) => e.id !== initial?.id).map((e) => (
            <option key={e.id} value={e.id}>{e.full_name} ({e.code})</option>
          ))}
        </Select>
      </FormField>
      {!isCreate && (
        <FormField label="Trạng thái làm việc">
          <Select value={form.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </FormField>
      )}
      <FormField label="Địa chỉ">
        <Input value={form.address} onChange={set('address')} placeholder="Số nhà, đường, quận/huyện, tỉnh/thành" />
      </FormField>
      <div className="flex justify-end gap-2.5 pt-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting ? 'Đang lưu...' : isCreate ? 'Thêm nhân viên' : 'Lưu thay đổi'}
        </Button>
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
    <div className="page-shell">
      <PageHeader
        title="Nhân viên"
        subtitle={meta ? `Tổng cộng ${meta.totalItems} nhân viên` : 'Quản lý hồ sơ nhân viên toàn công ty'}
        actions={
          canWrite ? (
            <Button type="button" onClick={() => setFormTarget('create')}>
              + Thêm nhân viên
            </Button>
          ) : undefined
        }
      />

      {notice && (
        <div className="mb-4 flex animate-fade-in items-start gap-2">
          <Alert tone="success" className="flex-1">
            {notice}
          </Alert>
          <button
            type="button"
            onClick={() => setNotice('')}
            aria-label="Đóng thông báo"
            className="mt-1 rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Thanh công cụ: tìm kiếm + bộ lọc */}
      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              {SearchIcon}
            </span>
            <Input
              className="pl-10"
              placeholder="Tìm theo tên, mã NV, email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Select
            value={departmentId}
            onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
          >
            <option value="">Tất cả phòng ban</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>
      </Card>

      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={canWrite ? 5 : 4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Không tìm thấy nhân viên nào"
            description={
              canWrite
                ? 'Chưa có nhân viên nào khớp bộ lọc. Hãy bấm "Thêm nhân viên" để bắt đầu.'
                : 'Chưa có nhân viên nào khớp bộ lọc.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="ui-th">Nhân viên</th>
                  <th className="ui-th">Phòng ban</th>
                  <th className="ui-th">Chức vụ</th>
                  <th className="ui-th">Ngày vào làm</th>
                  <th className="ui-th">Trạng thái</th>
                  {canWrite && <th className="ui-th text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((emp) => (
                  <tr key={emp.id} className="ui-tr">
                    <td className="ui-td">
                      <div className="flex items-center gap-3">
                        {emp.avatar_url ? (
                          <img src={emp.avatar_url} alt={emp.full_name} className="h-10 w-10 rounded-full object-cover ring-1 ring-inset ring-slate-900/5" />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-700 ring-1 ring-inset ring-brand-100">
                            {initials(emp.full_name)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <Link to={`/employees/${emp.id}`} className="font-semibold text-slate-900 transition hover:text-brand-600">
                            {emp.full_name}
                          </Link>
                          <div className="truncate text-xs text-slate-400">{emp.code} · {emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="ui-td">{deptName(emp)}</td>
                    <td className="ui-td">{posTitle(emp)}</td>
                    <td className="ui-td">{formatDate(emp.start_date)}</td>
                    <td className="ui-td">
                      <Badge tone={STATUS_TONE[emp.status] || 'slate'} dot>
                        {STATUS_LABEL[emp.status] || emp.status}
                      </Badge>
                    </td>
                    {canWrite && (
                      <td className="ui-td">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(`/employees/${emp.id}`)}>
                            Chi tiết
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setFormTarget(emp)} className="text-brand-600 hover:bg-brand-50 hover:text-brand-700">
                            Sửa
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget(emp)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                            Xóa
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Phân trang */}
      {meta && totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
          <span>
            Trang <strong className="font-semibold text-slate-700">{meta.page}</strong> / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Trước
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau →
            </Button>
          </div>
        </div>
      )}

      {/* Modal thêm / sửa */}
      {formTarget && (
        <Modal
          title={formTarget === 'create' ? 'Thêm nhân viên' : `Sửa hồ sơ — ${formTarget.full_name}`}
          onClose={() => setFormTarget(null)}
          width="max-w-2xl"
        >
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
          <p className="text-sm leading-relaxed text-slate-600">
            Anh/chị có chắc muốn xóa hồ sơ của <strong className="font-semibold text-slate-800">{deleteTarget.full_name}</strong> ({deleteTarget.code})?
            Thao tác này không thể hoàn tác và có thể ảnh hưởng tới dữ liệu chấm công, nghỉ phép, lương đã gắn với nhân viên.
          </p>
          <div className="mt-6 flex justify-end gap-2.5">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} disabled={submitting}>
              Huỷ
            </Button>
            <Button type="button" variant="danger" onClick={handleDelete} loading={submitting}>
              {submitting ? 'Đang xóa...' : 'Xóa nhân viên'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
