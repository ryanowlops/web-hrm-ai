// Trang chi tiết nhân viên — route /employees/:id
// Gồm: thông tin hồ sơ, danh sách hợp đồng lao động (cảnh báo sắp hết hạn
// trong 30 ngày), form sửa hồ sơ và form thêm hợp đồng (chỉ admin / hr).
// Trình bày theo design system v2: UI kit trong src/components/ui + .page-shell.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
} from '../../../components/ui';
import {
  getEmployee,
  updateEmployee,
  getContracts,
  createContract,
  parseApiError,
} from '../services';
import { getDepartments, getPositions } from '../../departments/services';

const STATUS_LABEL = { working: 'Đang làm việc', on_leave: 'Đang nghỉ phép', resigned: 'Đã nghỉ việc' };
const STATUS_TONE = { working: 'green', on_leave: 'amber', resigned: 'slate' };
const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));
const GENDER_LABEL = { male: 'Nam', female: 'Nữ', other: 'Khác' };
const CONTRACT_TYPE_LABEL = {
  probation: 'Thử việc',
  fixed_term: 'Xác định thời hạn',
  indefinite: 'Không xác định thời hạn',
  seasonal: 'Thời vụ / mùa vụ',
};
const CONTRACT_STATUS_LABEL = { active: 'Đang hiệu lực', expired: 'Đã hết hạn', terminated: 'Đã chấm dứt' };
const CONTRACT_STATUS_TONE = { active: 'green', expired: 'red', terminated: 'slate' };

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

// Class bổ sung khi ô nhập có lỗi (đè viền/focus của .ui-input).
const errCls = (hasError) =>
  hasError ? 'border-rose-400 hover:border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : '';

// Nhãn có dấu * cho trường bắt buộc (giữ đúng cách hiển thị cũ).
const reqLabel = (text) => (
  <>
    {text} <span className="text-rose-500">*</span>
  </>
);

function InfoRow({ label, children }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-semibold leading-relaxed text-slate-800">{children || '—'}</dd>
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
      {formError && (
        <Alert tone="error" className="sm:col-span-2">{formError}</Alert>
      )}
      <FormField label={reqLabel('Loại hợp đồng')} error={errors.contract_type}>
        <Select className={errCls(errors.contract_type)} value={form.contract_type} onChange={set('contract_type')}>
          {Object.entries(CONTRACT_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </FormField>
      <FormField label={reqLabel('Lương cơ bản (VND/tháng)')} error={errors.base_salary}>
        <Input type="number" min="0" step="1000" className={errCls(errors.base_salary)} value={form.base_salary} onChange={set('base_salary')} placeholder="VD: 15000000" />
      </FormField>
      <FormField label={reqLabel('Ngày bắt đầu')} error={errors.start_date}>
        <Input type="date" className={errCls(errors.start_date)} value={form.start_date} onChange={set('start_date')} />
      </FormField>
      <FormField label="Ngày kết thúc" error={errors.end_date} hint="Để trống nếu hợp đồng không xác định thời hạn.">
        <Input type="date" className={errCls(errors.end_date)} value={form.end_date} onChange={set('end_date')} />
      </FormField>
      <FormField label="Phụ cấp cố định (VND/tháng)" error={errors.allowance}>
        <Input type="number" min="0" step="1000" className={errCls(errors.allowance)} value={form.allowance} onChange={set('allowance')} placeholder="VD: 1000000" />
      </FormField>
      <div className="flex items-end justify-end gap-2.5 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Huỷ</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {submitting ? 'Đang lưu...' : 'Thêm hợp đồng'}
        </Button>
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
      {formError && (
        <Alert tone="error" className="sm:col-span-2">{formError}</Alert>
      )}
      <FormField label={reqLabel('Họ tên')} error={errors.full_name}>
        <Input className={errCls(errors.full_name)} value={form.full_name} onChange={set('full_name')} />
      </FormField>
      <FormField label={reqLabel('Email')} error={errors.email}>
        <Input type="email" className={errCls(errors.email)} value={form.email} onChange={set('email')} />
      </FormField>
      <FormField label="Số điện thoại" error={errors.phone}>
        <Input className={errCls(errors.phone)} value={form.phone} onChange={set('phone')} />
      </FormField>
      <FormField label="Ngày sinh">
        <Input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
      </FormField>
      <FormField label="Giới tính">
        <Select value={form.gender} onChange={set('gender')}>
          {Object.entries(GENDER_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
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
      <FormField label="Trạng thái làm việc">
        <Select value={form.status} onChange={set('status')}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Địa chỉ">
        <Input value={form.address} onChange={set('address')} />
      </FormField>
      <div className="flex justify-end gap-2.5 pt-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Huỷ</Button>
        <Button type="submit" variant="primary" loading={submitting}>
          {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
        </Button>
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
  const managerName = employee?.manager?.full_name || employee?.manager_name || '—';

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
    return (
      <div className="page-shell" aria-busy="true">
        <Skeleton className="h-5 w-44" />
        <div className="ui-card mt-5 flex items-center gap-5 px-6 py-6">
          <Skeleton className="h-20 w-20 shrink-0 rounded-[22px]" />
          <div className="w-full max-w-md space-y-3">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="ui-card space-y-4 px-5 py-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
          <div className="ui-card space-y-4 px-5 py-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        </div>
        <div className="ui-card mt-5 space-y-4 px-5 py-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="page-shell">
        <Link to="/employees" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700">← Quay lại danh sách nhân viên</Link>
        <Alert tone="error" className="mt-5">{error || 'Không tải được hồ sơ nhân viên.'}</Alert>
      </div>
    );
  }

  const initials = (employee.full_name || 'NV').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="page-shell">
      <Link to="/employees" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700">← Danh sách nhân viên</Link>

      {/* Header hồ sơ */}
      <Card className="mt-4">
        <CardBody className="px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-5">
              {employee.avatar_url ? (
                <img
                  src={employee.avatar_url}
                  alt={employee.full_name}
                  className="h-20 w-20 shrink-0 rounded-[22px] object-cover shadow-card ring-1 ring-slate-200"
                />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-brand-500 via-brand-600 to-navy-800 text-[26px] font-extrabold tracking-wide text-white shadow-lift ring-1 ring-brand-700/30">
                  {initials}
                </span>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-slate-900">
                  {employee.full_name}
                </h1>
                <p className="mt-1 text-sm font-medium text-slate-500">{employee.code} · {posTitle} · {deptName}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[employee.status] || 'slate'} dot>
                    {STATUS_LABEL[employee.status] || employee.status}
                  </Badge>
                  <Badge tone="blue">{deptName}</Badge>
                  <Badge tone="slate">{posTitle}</Badge>
                </div>
              </div>
            </div>
            {canWrite && (
              <Button type="button" variant="primary" onClick={() => setEditing(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
                Sửa hồ sơ
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {notice && (
        <div className="relative mt-5">
          <Alert tone="success" className="pr-11">{notice}</Alert>
          <button
            type="button"
            onClick={() => setNotice('')}
            aria-label="Đóng thông báo"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {expiringContracts.length > 0 && (
        <Alert tone="warning" className="mt-5">
          <strong>Cảnh báo hợp đồng:</strong>{' '}
          {expiringContracts.map((c) => {
            const left = daysUntil(c.end_date);
            return left < 0
              ? `Hợp đồng ${CONTRACT_TYPE_LABEL[c.contract_type] || c.contract_type} đã hết hạn ngày ${formatDate(c.end_date)}.`
              : `Hợp đồng ${CONTRACT_TYPE_LABEL[c.contract_type] || c.contract_type} sẽ hết hạn sau ${left} ngày (${formatDate(c.end_date)}).`;
          }).join(' ')}
        </Alert>
      )}

      {/* Thông tin hồ sơ */}
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Thông tin cá nhân" />
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <InfoRow label="Mã nhân viên">{employee.code}</InfoRow>
              <InfoRow label="Email">{employee.email}</InfoRow>
              <InfoRow label="Số điện thoại">{employee.phone}</InfoRow>
              <InfoRow label="Ngày sinh">{formatDate(employee.date_of_birth)}</InfoRow>
              <InfoRow label="Giới tính">{GENDER_LABEL[employee.gender] || employee.gender}</InfoRow>
              <InfoRow label="Địa chỉ">{employee.address}</InfoRow>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Thông tin công việc" />
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              <InfoRow label="Phòng ban">{deptName}</InfoRow>
              <InfoRow label="Chức vụ">{posTitle}</InfoRow>
              <InfoRow label="Ngày vào làm">{formatDate(employee.start_date)}</InfoRow>
              <InfoRow label="Quản lý trực tiếp">{managerName}</InfoRow>
              <InfoRow label="Trạng thái làm việc">
                <Badge tone={STATUS_TONE[employee.status] || 'slate'} dot>
                  {STATUS_LABEL[employee.status] || employee.status}
                </Badge>
              </InfoRow>
            </dl>
          </CardBody>
        </Card>
      </div>

      {/* Hợp đồng */}
      <Card className="mt-5">
        <CardHeader
          title="Hợp đồng lao động"
          actions={
            canWrite ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setAddingContract(true)}>
                + Thêm hợp đồng
              </Button>
            ) : null
          }
        />
        {contracts.length === 0 ? (
          <EmptyState
            title="Chưa có hợp đồng lao động"
            description="Nhân viên này chưa có hợp đồng nào."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="ui-th">Loại hợp đồng</th>
                  <th className="ui-th">Bắt đầu</th>
                  <th className="ui-th">Kết thúc</th>
                  <th className="ui-th">Lương cơ bản</th>
                  <th className="ui-th">Phụ cấp</th>
                  <th className="ui-th">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const left = daysUntil(c.end_date);
                  const expiring = left !== null && left <= 30 && left >= 0;
                  const expired = left !== null && left < 0;
                  return (
                    <tr key={c.id} className="ui-tr">
                      <td className="ui-td font-semibold text-slate-800">{CONTRACT_TYPE_LABEL[c.contract_type] || c.contract_type}</td>
                      <td className="ui-td">{formatDate(c.start_date)}</td>
                      <td className="ui-td">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {c.end_date ? formatDate(c.end_date) : 'Không thời hạn'}
                          {expiring && <Badge tone="amber">Còn {left} ngày</Badge>}
                          {expired && <Badge tone="red">Đã hết hạn</Badge>}
                        </span>
                      </td>
                      <td className="ui-td font-semibold tabular-nums text-slate-800">{formatMoney(c.base_salary)}</td>
                      <td className="ui-td tabular-nums">{formatMoney(c.allowance)}</td>
                      <td className="ui-td">
                        <Badge tone={CONTRACT_STATUS_TONE[c.status] || 'slate'}>
                          {CONTRACT_STATUS_LABEL[c.status] || c.status || '—'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Modal title={`Sửa hồ sơ — ${employee.full_name}`} onClose={() => setEditing(false)} width="max-w-2xl">
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
        <Modal title="Thêm hợp đồng lao động" onClose={() => setAddingContract(false)} width="max-w-2xl">
          <ContractForm submitting={submitting} onCancel={() => setAddingContract(false)} onSubmit={handleAddContract} />
        </Modal>
      )}
    </div>
  );
}
