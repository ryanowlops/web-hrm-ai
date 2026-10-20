// Trang chi tiết nhân viên — route /employees/:id
// Gồm: thông tin hồ sơ, danh sách hợp đồng lao động (cảnh báo sắp hết hạn
// trong 30 ngày), form sửa hồ sơ và form thêm hợp đồng (chỉ admin / hr).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  getEmployee,
  updateEmployee,
  getContracts,
  createContract,
  parseApiError,
} from '../services';
import { getDepartments, getPositions } from '../../departments/services';

const STATUS_LABEL = { working: 'Đang làm việc', on_leave: 'Đang nghỉ phép', resigned: 'Đã nghỉ việc' };
const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
const GENDER_LABEL = { male: 'Nam', female: 'Nữ', other: 'Khác' };
const CONTRACT_TYPE_LABEL = {
  probation: 'Thử việc',
  fixed_term: 'Xác định thời hạn',
  indefinite: 'Không xác định thời hạn',
  seasonal: 'Thời vụ / mùa vụ',
};
const CONTRACT_STATUS_LABEL = { active: 'Đang hiệu lực', expired: 'Đã hết hạn', terminated: 'Đã chấm dứt' };

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

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  return `${new Intl.NumberFormat('vi-VN').format(Number(value))} ₫`;
}

// Số ngày còn lại tới ngày kết thúc hợp đồng (âm = đã quá hạn).
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
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

function InfoRow({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-700">{children || '—'}</dd>
    </div>
  );
}

// ---------- Form thêm hợp đồng ----------

function validateContract(form) {
  const errors = {};
  if (!form.contract_type) errors.contract_type = 'Vui lòng chọn loại hợp đồng.';
  if (!form.start_date) errors.start_date = 'Vui lòng chọn ngày bắt đầu.';
  if (form.end_date && form.start_date && form.end_date < form.start_date) {
    errors.end_date = 'Ngày kết thúc phải sau ngày bắt đầu.';
  }
  if (form.base_salary === '' || Number(form.base_salary) <= 0) {
    errors.base_salary = 'Lương cơ bản phải lớn hơn 0.';
  }
  if (form.allowance !== '' && Number(form.allowance) < 0) {
    errors.allowance = 'Phụ cấp không được âm.';
  }
  return errors;
}

function ContractForm({ onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({ contract_type: 'fixed_term', start_date: '', end_date: '', base_salary: '', allowance: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validateContract(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      await onSubmit({
        contract_type: form.contract_type,
        start_date: form.start_date,
        end_date: form.end_date || null,
        base_salary: Number(form.base_salary),
        allowance: form.allowance === '' ? 0 : Number(form.allowance),
      });
    } catch (err) {
      const { message, fieldErrors } = parseApiError(err, 'Không tạo được hợp đồng.');
      setFormError(message);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {formError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{formError}</div>}
      <Field label="Loại hợp đồng" required error={errors.contract_type}>
        <select className={inputClass(errors.contract_type)} value={form.contract_type} onChange={set('contract_type')}>
          {Object.entries(CONTRACT_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Field>
      <Field label="Lương cơ bản (VND/tháng)" required error={errors.base_salary}>
        <input type="number" min="0" step="1000" className={inputClass(errors.base_salary)} value={form.base_salary} onChange={set('base_salary')} placeholder="VD: 15000000" />
      </Field>
      <Field label="Ngày bắt đầu" required error={errors.start_date}>
        <input type="date" className={inputClass(errors.start_date)} value={form.start_date} onChange={set('start_date')} />
      </Field>
      <Field label="Ngày kết thúc" error={errors.end_date}>
        <input type="date" className={inputClass(errors.end_date)} value={form.end_date} onChange={set('end_date')} />
        <span className="mt-1 block text-xs text-slate-400">Để trống nếu hợp đồng không xác định thời hạn.</span>
      </Field>
      <Field label="Phụ cấp cố định (VND/tháng)" error={errors.allowance}>
        <input type="number" min="0" step="1000" className={inputClass(errors.allowance)} value={form.allowance} onChange={set('allowance')} placeholder="VD: 1000000" />
      </Field>
      <div className="flex items-end justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Huỷ</button>
        <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
          {submitting ? 'Đang lưu...' : 'Thêm hợp đồng'}
        </button>
      </div>
    </form>
  );
}

// ---------- Form sửa hồ sơ ----------

function EditProfileForm({ employee, departments, positions, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({
    full_name: employee.full_name || '',
    email: employee.email || '',
    phone: employee.phone || '',
    date_of_birth: employee.date_of_birth ? employee.date_of_birth.slice(0, 10) : '',
    gender: employee.gender || 'male',
    address: employee.address || '',
    department_id: employee.department_id ? String(employee.department_id) : '',
    position_id: employee.position_id ? String(employee.position_id) : '',
    start_date: employee.start_date ? employee.start_date.slice(0, 10) : '',
    status: employee.status || 'working',
  });
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
    const errs = {};
    if (!form.full_name.trim()) errs.full_name = 'Vui lòng nhập họ tên nhân viên.';
    if (!form.email.trim()) errs.email = 'Vui lòng nhập email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Email không đúng định dạng.';
    if (form.phone && !/^0\d{9}$/.test(form.phone.trim())) errs.phone = 'Số điện thoại phải gồm 10 số và bắt đầu bằng 0.';
    if (!form.department_id) errs.department_id = 'Vui lòng chọn phòng ban.';
    if (!form.start_date) errs.start_date = 'Vui lòng chọn ngày vào làm.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      await onSubmit({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender,
        address: form.address.trim() || null,
        department_id: Number(form.department_id),
        position_id: form.position_id ? Number(form.position_id) : null,
        start_date: form.start_date,
        status: form.status,
      });
    } catch (err) {
      const { message, fieldErrors } = parseApiError(err, 'Không lưu được hồ sơ.');
      setFormError(message);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {formError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{formError}</div>}
      <Field label="Họ tên" required error={errors.full_name}>
        <input className={inputClass(errors.full_name)} value={form.full_name} onChange={set('full_name')} />
      </Field>
      <Field label="Email" required error={errors.email}>
        <input type="email" className={inputClass(errors.email)} value={form.email} onChange={set('email')} />
      </Field>
      <Field label="Số điện thoại" error={errors.phone}>
        <input className={inputClass(errors.phone)} value={form.phone} onChange={set('phone')} />
      </Field>
      <Field label="Ngày sinh">
        <input type="date" className={inputClass(false)} value={form.date_of_birth} onChange={set('date_of_birth')} />
      </Field>
      <Field label="Giới tính">
        <select className={inputClass(false)} value={form.gender} onChange={set('gender')}>
          {Object.entries(GENDER_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
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
      <Field label="Trạng thái làm việc">
        <select className={inputClass(false)} value={form.status} onChange={set('status')}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Địa chỉ">
        <input className={inputClass(false)} value={form.address} onChange={set('address')} />
      </Field>
      <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Huỷ</button>
        <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
          {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
}

// ---------- Trang chi tiết ----------

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const fallbackRole = useMemo(getCurrentRole, []);
  const role = user?.role || fallbackRole;
  const canWrite = role === 'admin' || role === 'hr';

  const [employee, setEmployee] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [addingContract, setAddingContract] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [emp, ctrs] = await Promise.all([
        getEmployee(id),
        getContracts(id).catch(() => []),
      ]);
      setEmployee(emp);
      setContracts(ctrs);
    } catch (err) {
      const status = err?.response?.status;
      setError(
        status === 404
          ? 'Không tìm thấy nhân viên này (hoặc bạn không có quyền xem hồ sơ này).'
          : parseApiError(err, 'Không tải được hồ sơ nhân viên.').message,
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

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
        /* form sửa vẫn hiện các trường cơ bản */
      }
    })();
  }, []);

  const expiringContracts = useMemo(
    () => contracts.filter((c) => {
      const left = daysUntil(c.end_date);
      return left !== null && left <= 30 && (c.status === 'active' || !c.status);
    }),
    [contracts],
  );

  const deptName = employee?.department?.name || employee?.department_name
    || departments.find((d) => d.id === employee?.department_id)?.name || '—';
  const posTitle = employee?.position?.title || employee?.position_title
    || positions.find((p) => p.id === employee?.position_id)?.title || '—';

  const handleUpdate = async (payload) => {
    setSubmitting(true);
    try {
      const updated = await updateEmployee(id, payload);
      setEmployee((prev) => ({ ...prev, ...updated }));
      setEditing(false);
      setNotice('Đã cập nhật hồ sơ nhân viên.');
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddContract = async (payload) => {
    setSubmitting(true);
    try {
      await createContract(id, payload);
      setAddingContract(false);
      setNotice('Đã thêm hợp đồng mới.');
      const ctrs = await getContracts(id).catch(() => contracts);
      setContracts(ctrs);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl p-6 text-center text-slate-400">Đang tải hồ sơ...</div>;
  }

  if (error || !employee) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Link to="/employees" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">← Quay lại danh sách nhân viên</Link>
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error || 'Không tải được hồ sơ nhân viên.'}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link to="/employees" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">← Danh sách nhân viên</Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          {employee.avatar_url ? (
            <img src={employee.avatar_url} alt={employee.full_name} className="h-16 w-16 rounded-2xl object-cover" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-lg font-bold text-indigo-600">
              {(employee.full_name || 'NV').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{employee.full_name}</h1>
            <p className="text-sm text-slate-500">{employee.code} · {posTitle} · {deptName}</p>
            <span className="mt-1 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {STATUS_LABEL[employee.status] || employee.status}
            </span>
          </div>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            Sửa hồ sơ
          </button>
        )}
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      {expiringContracts.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ <strong>Cảnh báo hợp đồng:</strong>{' '}
          {expiringContracts.map((c) => {
            const left = daysUntil(c.end_date);
            return left < 0
              ? `Hợp đồng ${CONTRACT_TYPE_LABEL[c.contract_type] || c.contract_type} đã hết hạn ngày ${formatDate(c.end_date)}.`
              : `Hợp đồng ${CONTRACT_TYPE_LABEL[c.contract_type] || c.contract_type} sẽ hết hạn sau ${left} ngày (${formatDate(c.end_date)}).`;
          }).join(' ')}
        </div>
      )}

      {/* Hồ sơ */}
      <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Thông tin hồ sơ</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
          <InfoRow label="Mã nhân viên">{employee.code}</InfoRow>
          <InfoRow label="Email">{employee.email}</InfoRow>
          <InfoRow label="Số điện thoại">{employee.phone}</InfoRow>
          <InfoRow label="Ngày sinh">{formatDate(employee.date_of_birth)}</InfoRow>
          <InfoRow label="Giới tính">{GENDER_LABEL[employee.gender] || employee.gender}</InfoRow>
          <InfoRow label="Ngày vào làm">{formatDate(employee.start_date)}</InfoRow>
          <InfoRow label="Phòng ban">{deptName}</InfoRow>
          <InfoRow label="Chức vụ">{posTitle}</InfoRow>
          <InfoRow label="Địa chỉ">{employee.address}</InfoRow>
        </dl>
      </section>

      {/* Hợp đồng */}
      <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Hợp đồng lao động</h2>
          {canWrite && (
            <button
              type="button"
              onClick={() => setAddingContract(true)}
              className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50"
            >
              + Thêm hợp đồng
            </button>
          )}
        </div>
        {contracts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nhân viên này chưa có hợp đồng nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">Loại hợp đồng</th>
                  <th className="px-3 py-2">Bắt đầu</th>
                  <th className="px-3 py-2">Kết thúc</th>
                  <th className="px-3 py-2">Lương cơ bản</th>
                  <th className="px-3 py-2">Phụ cấp</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const left = daysUntil(c.end_date);
                  const expiring = left !== null && left <= 30 && left >= 0;
                  const expired = left !== null && left < 0;
                  return (
                    <tr key={c.id} className="border-b border-slate-50">
                      <td className="px-3 py-2.5 font-medium text-slate-700">{CONTRACT_TYPE_LABEL[c.contract_type] || c.contract_type}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatDate(c.start_date)}</td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {c.end_date ? formatDate(c.end_date) : 'Không thời hạn'}
                        {expiring && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Còn {left} ngày</span>}
                        {expired && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Đã hết hạn</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{formatMoney(c.base_salary)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatMoney(c.allowance)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{CONTRACT_STATUS_LABEL[c.status] || c.status || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <Modal title={`Sửa hồ sơ — ${employee.full_name}`} onClose={() => setEditing(false)}>
          <EditProfileForm
            employee={employee}
            departments={departments}
            positions={positions}
            submitting={submitting}
            onCancel={() => setEditing(false)}
            onSubmit={handleUpdate}
          />
        </Modal>
      )}

      {addingContract && (
        <Modal title="Thêm hợp đồng lao động" onClose={() => setAddingContract(false)}>
          <ContractForm submitting={submitting} onCancel={() => setAddingContract(false)} onSubmit={handleAddContract} />
        </Modal>
      )}
    </div>
  );
}
