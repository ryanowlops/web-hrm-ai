// Trang Phòng ban & Chức vụ — route /departments
// Danh sách phòng ban (trưởng phòng, số nhân viên) và các chức vụ thuộc
// từng phòng. CRUD chỉ hiển thị với admin / hr (server vẫn kiểm tra quyền).
// Trình bày theo design system v2: .page-shell, PageHeader, Card, Badge,
// bảng .ui-table và Modal/Button/FormField của UI kit (components/ui).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Button,
  Card,
  CardHeader,
  Badge,
  Modal,
  PageHeader,
  EmptyState,
  Alert,
  FormField,
  Input,
  Select,
  Skeleton,
} from '../../../components/ui';
import { StaggerList, StaggerItem } from '../../../components/motion';
import { IconBuilding, IconUser, IconEdit, IconTrash, IconBriefcase } from '../../../components/icons.jsx';
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

const errorInputClass = (hasError) =>
  hasError ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : '';

function FormActions({ onCancel, submitting, submitLabel }) {
  return (
    <div className="flex justify-end gap-2.5 pt-1">
      <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
        Huỷ
      </Button>
      <Button type="submit" loading={submitting} disabled={submitting}>
        {submitting ? 'Đang lưu...' : submitLabel}
      </Button>
    </div>
  );
}

// Nút thao tác dạng ghost chỉ có icon (Sửa / Xóa) dùng trong thẻ và bảng.
function GhostIconButton({ label, tone = 'brand', onClick }) {
  const tones = {
    brand: 'text-slate-400 hover:bg-brand-50 hover:text-brand-600',
    danger: 'text-slate-400 hover:bg-rose-50 hover:text-rose-600',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 transition duration-200 hover:scale-105 active:scale-95 ${tones[tone] || tones.brand}`}
    >
      {label === 'Sửa' ? <IconEdit size={16} /> : <IconTrash size={16} />}
    </button>
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
      {formError && <Alert tone="error">{formError}</Alert>}
      <FormField
        label={<>Tên phòng ban <span className="text-rose-500">*</span></>}
        error={errors.name}
      >
        <Input
          className={errorInputClass(errors.name)}
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors((p) => ({ ...p, name: undefined })); }}
          placeholder="VD: Phòng Kỹ thuật"
        />
      </FormField>
      <FormField label="Trưởng phòng">
        <Select
          value={form.manager_id}
          onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value }))}
        >
          <option value="">— Chưa gán —</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.code})</option>
          ))}
        </Select>
      </FormField>
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
      {formError && <Alert tone="error">{formError}</Alert>}
      <FormField
        label={<>Tên chức vụ <span className="text-rose-500">*</span></>}
        error={errors.title}
      >
        <Input
          className={errorInputClass(errors.title)}
          value={form.title}
          onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); setErrors((p) => ({ ...p, title: undefined })); }}
          placeholder="VD: Lập trình viên"
        />
      </FormField>
      <FormField
        label={<>Phòng ban <span className="text-rose-500">*</span></>}
        error={errors.department_id}
      >
        <Select
          className={errorInputClass(errors.department_id)}
          value={form.department_id}
          onChange={(e) => { setForm((f) => ({ ...f, department_id: e.target.value })); setErrors((p) => ({ ...p, department_id: undefined })); }}
        >
          <option value="">— Chọn phòng ban —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </FormField>
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

  const departmentName = (deptId) =>
    departments.find((d) => d.id === deptId)?.name || '—';

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
    <div className="page-shell">
      <PageHeader
        eyebrow="Cơ cấu tổ chức"
        title="Phòng ban & Chức vụ"
        subtitle={`Cơ cấu tổ chức công ty — ${departments.length} phòng ban, ${positions.length} chức vụ`}
        actions={canWrite && (
          <>
            <Button type="button" variant="secondary" onClick={() => setPosTarget({})}>
              + Thêm chức vụ
            </Button>
            <Button type="button" onClick={() => setDeptTarget('create')}>
              + Thêm phòng ban
            </Button>
          </>
        )}
      />

      {notice && (
        <Alert tone="success" className="mb-5 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="shrink-0 text-emerald-500 transition hover:text-emerald-700" aria-label="Đóng thông báo">✕</button>
        </Alert>
      )}
      {error && (
        <Alert tone="error" className="mb-5 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="shrink-0 text-rose-400 transition hover:text-rose-600" aria-label="Đóng thông báo">✕</button>
        </Alert>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
          <span className="sr-only">Đang tải dữ liệu...</span>
        </div>
      ) : departments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconBuilding size={26} />}
            title="Chưa có phòng ban nào."
            description={canWrite ? 'Hãy bấm "Thêm phòng ban" để tạo cơ cấu tổ chức.' : undefined}
          />
        </Card>
      ) : (
        <>
          <StaggerList className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {departments.map((dept, i) => (
              <StaggerItem key={dept.id} index={i} className="h-full">
              <Card hover className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                      <IconBuilding size={20} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-display truncate text-base font-bold tracking-[-0.01em] text-slate-900">{dept.name}</h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                        <IconUser size={14} className="shrink-0 text-slate-400" />
                        <span className="truncate">
                          Trưởng phòng: <span className="font-semibold text-slate-700">{managerName(dept)}</span>
                        </span>
                      </p>
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-0.5">
                      <GhostIconButton label="Sửa" onClick={() => setDeptTarget(dept)} />
                      <GhostIconButton label="Xóa" tone="danger" onClick={() => setDeleteDept(dept)} />
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge tone="blue" dot>{employeeCount(dept)} nhân viên</Badge>
                  <Badge tone="slate">{positionsOf(dept.id).length} chức vụ</Badge>
                </div>

                {canWrite && (
                  <div className="mt-auto pt-4">
                    <div className="border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setPosTarget({ departmentId: dept.id })}
                        className="text-sm font-semibold text-brand-600 transition hover:text-brand-800"
                      >
                        + Thêm chức vụ vào phòng này
                      </button>
                    </div>
                  </div>
                )}
              </Card>
              </StaggerItem>
            ))}
          </StaggerList>

          <Card className="mt-6 animate-fade-up">
            <CardHeader
              title="Danh sách chức vụ"
              subtitle={`${positions.length} chức vụ thuộc ${departments.length} phòng ban`}
              actions={canWrite && (
                <Button type="button" size="sm" variant="secondary" onClick={() => setPosTarget({})}>
                  + Thêm chức vụ
                </Button>
              )}
            />
            {positions.length === 0 ? (
              <EmptyState
                icon={<IconBriefcase size={26} />}
                title="Chưa có chức vụ nào."
                description={canWrite ? 'Bấm "+ Thêm chức vụ" để tạo chức vụ đầu tiên cho phòng ban.' : undefined}
              />
            ) : (
              <div className="nice-scroll overflow-x-auto">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th className="ui-th">Chức vụ</th>
                      <th className="ui-th">Phòng ban</th>
                      {canWrite && <th className="ui-th text-right">Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => (
                      <tr key={pos.id} className="ui-tr">
                        <td className="ui-td font-semibold text-slate-800">{pos.title}</td>
                        <td className="ui-td">{departmentName(pos.department_id)}</td>
                        {canWrite && (
                          <td className="ui-td">
                            <div className="flex items-center justify-end gap-0.5">
                              <GhostIconButton label="Sửa" onClick={() => setPosTarget({ position: pos })} />
                              <GhostIconButton label="Xóa" tone="danger" onClick={() => setDeletePos(pos)} />
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
        </>
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
        <Modal
          title="Xóa phòng ban"
          onClose={() => !submitting && setDeleteDept(null)}
          actions={(
            <>
              <Button type="button" variant="secondary" onClick={() => setDeleteDept(null)} disabled={submitting}>
                Huỷ
              </Button>
              <Button type="button" variant="danger" onClick={handleDeleteDept} disabled={submitting} loading={submitting}>
                {submitting ? 'Đang xóa...' : 'Xóa phòng ban'}
              </Button>
            </>
          )}
        >
          <p className="text-sm leading-relaxed text-slate-600">
            Anh/chị có chắc muốn xóa <strong>{deleteDept.name}</strong>?
            Phòng ban đang có nhân viên hoặc chức vụ sẽ không xóa được — hệ thống sẽ yêu cầu chuyển nhân viên sang phòng khác trước.
          </p>
        </Modal>
      )}

      {/* Modal xác nhận xóa chức vụ */}
      {deletePos && (
        <Modal
          title="Xóa chức vụ"
          onClose={() => !submitting && setDeletePos(null)}
          actions={(
            <>
              <Button type="button" variant="secondary" onClick={() => setDeletePos(null)} disabled={submitting}>
                Huỷ
              </Button>
              <Button type="button" variant="danger" onClick={handleDeletePos} disabled={submitting} loading={submitting}>
                {submitting ? 'Đang xóa...' : 'Xóa chức vụ'}
              </Button>
            </>
          )}
        >
          <p className="text-sm leading-relaxed text-slate-600">
            Anh/chị có chắc muốn xóa chức vụ <strong>{deletePos.title}</strong>?
            Nhân viên đang giữ chức vụ này sẽ cần được gán lại chức vụ khác.
          </p>
        </Modal>
      )}
    </div>
  );
}
