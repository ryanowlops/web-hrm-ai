// Trang Tài sản — route /assets
// Danh mục tài sản công ty (HR/Admin/Manager xem, HR/Admin quản lý):
// bảng phẳng v4, lọc theo trạng thái/loại/tìm kiếm, cấp phát & thu hồi
// qua modal, xem lịch sử cấp phát. Nhân viên xem tab "Tài sản của tôi".
// Trình bày theo hợp đồng thiết kế v4 (docs/frontend-design-v4.md).
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Button,
  Badge,
  Modal,
  PageHeader,
  EmptyState,
  Alert,
  FormField,
  Input,
  Select,
  Textarea,
  TableSkeleton,
} from '../../../components/ui';
import { IconPlus, IconEdit, IconSearch } from '../../../components/icons.jsx';
import {
  getAssets,
  createAsset,
  updateAsset,
  assignAsset,
  returnAssignment,
  getMyAssets,
  getAssetHistory,
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

const STATUS_META = {
  available: { label: 'Sẵn sàng', tone: 'green' },
  assigned: { label: 'Đang cấp phát', tone: 'blue' },
  maintenance: { label: 'Bảo trì', tone: 'amber' },
  retired: { label: 'Đã thanh lý', tone: 'slate' },
};

const CATEGORIES = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'monitor', label: 'Màn hình' },
  { value: 'phone', label: 'Điện thoại' },
  { value: 'tablet', label: 'Máy tính bảng' },
  { value: 'accessory', label: 'Phụ kiện' },
  { value: 'furniture', label: 'Nội thất / bàn ghế' },
  { value: 'other', label: 'Khác' },
];

const categoryLabel = (value) =>
  CATEGORIES.find((c) => c.value === value)?.label || value || '—';

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('vi-VN');
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const errorInputClass = (hasError) =>
  hasError ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : '';

function GhostIconButton({ label, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
    >
      <IconEdit size={16} />
    </button>
  );
}

// ---------- Form tạo / sửa tài sản ----------

function AssetForm({ initial, onSubmit, onCancel, submitting }) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({
    code: initial?.code || '',
    name: initial?.name || '',
    category: initial?.category || '',
    serial: initial?.serial || '',
    purchase_date: initial?.purchase_date ? String(initial.purchase_date).slice(0, 10) : '',
    status: initial?.status || 'available',
    notes: initial?.notes || '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((p) => ({ ...p, [field]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const local = {};
    if (!form.code.trim()) local.code = 'Trường này là bắt buộc.';
    if (!form.name.trim()) local.name = 'Trường này là bắt buộc.';
    setErrors(local);
    if (Object.keys(local).length) return;
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category || null,
      serial: form.serial.trim() || null,
      purchase_date: form.purchase_date || null,
      notes: form.notes.trim() || null,
    };
    // Đổi trạng thái qua form chỉ khi sửa và tài sản không đang được cấp phát
    // (trạng thái 'assigned' do luồng cấp phát/thu hồi quyết định).
    if (isEdit && initial.status !== 'assigned') payload.status = form.status;
    try {
      await onSubmit(payload);
    } catch (err) {
      const { message, fieldErrors } = parseApiError(err, 'Không lưu được tài sản.');
      setFormError(message);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={<>Mã tài sản <span className="text-rose-500">*</span></>} error={errors.code}>
          <Input className={errorInputClass(errors.code)} value={form.code} onChange={set('code')} placeholder="VD: LT-001" />
        </FormField>
        <FormField label={<>Tên tài sản <span className="text-rose-500">*</span></>} error={errors.name}>
          <Input className={errorInputClass(errors.name)} value={form.name} onChange={set('name')} placeholder="VD: MacBook Pro 14 inch" />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Loại tài sản">
          <Select value={form.category} onChange={set('category')}>
            <option value="">— Chưa phân loại —</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Số serial">
          <Input value={form.serial} onChange={set('serial')} placeholder="VD: C02XL0ABJ1H0" />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Ngày mua">
          <Input type="date" value={form.purchase_date} onChange={set('purchase_date')} />
        </FormField>
        {isEdit && (
          <FormField label="Trạng thái" hint={initial.status === 'assigned' ? 'Đang cấp phát — thu hồi trước khi đổi trạng thái.' : undefined}>
            <Select value={form.status} onChange={set('status')} disabled={initial.status === 'assigned'}>
              <option value="available">Sẵn sàng</option>
              <option value="maintenance">Bảo trì</option>
              <option value="retired">Đã thanh lý</option>
              {initial.status === 'assigned' && <option value="assigned">Đang cấp phát</option>}
            </Select>
          </FormField>
        )}
      </div>
      <FormField label="Ghi chú">
        <Textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Tình trạng, phụ kiện kèm theo..." />
      </FormField>
      <div className="flex justify-end gap-2.5 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>Huỷ</Button>
        <Button type="submit" loading={submitting} disabled={submitting}>
          {submitting ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Thêm tài sản'}
        </Button>
      </div>
    </form>
  );
}

// ---------- Form cấp phát ----------

function AssignForm({ asset, employees, onSubmit, onCancel, submitting }) {
  const [employeeId, setEmployeeId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeId) {
      setError('Hãy chọn nhân viên nhận tài sản.');
      return;
    }
    try {
      await onSubmit({ employee_id: Number(employeeId), note: note.trim() || null });
    } catch (err) {
      setFormError(parseApiError(err, 'Không cấp phát được tài sản.').message);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <p className="text-sm text-gray-500">
        Cấp phát <span className="font-medium text-gray-900">{asset.code} — {asset.name}</span> cho nhân viên:
      </p>
      <FormField label={<>Nhân viên nhận <span className="text-rose-500">*</span></>} error={error}>
        <Select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setError(''); }}>
          <option value="">— Chọn nhân viên —</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.code})</option>
          ))}
        </Select>
      </FormField>
      <FormField label="Ghi chú">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="VD: Kèm sạc và túi chống sốc" />
      </FormField>
      <div className="flex justify-end gap-2.5 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>Huỷ</Button>
        <Button type="submit" loading={submitting} disabled={submitting}>
          {submitting ? 'Đang cấp phát...' : 'Xác nhận cấp phát'}
        </Button>
      </div>
    </form>
  );
}

// ---------- Trang chính ----------

export default function AssetsPage() {
  const { user } = useAuth();
  const role = user?.role || getCurrentRole();
  const canWrite = role === 'admin' || role === 'hr';
  const canViewList = role === 'admin' || role === 'hr' || role === 'manager';

  const [tab, setTab] = useState(canViewList ? 'all' : 'mine');

  // Danh mục
  const [assets, setAssets] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Tài sản của tôi
  const [myAssets, setMyAssets] = useState([]);
  const [myLoading, setMyLoading] = useState(true);

  const [employees, setEmployees] = useState([]);
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal states
  const [assetModal, setAssetModal] = useState(null); // {initial: asset|null}
  const [assignModal, setAssignModal] = useState(null); // asset
  const [returnModal, setReturnModal] = useState(null); // asset (có holder)
  const [returnNote, setReturnNote] = useState('');
  const [returnError, setReturnError] = useState('');
  const [historyModal, setHistoryModal] = useState(null); // {asset, items, loading}

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const loadAssets = useCallback(async () => {
    if (!canViewList) return;
    setLoading(true);
    try {
      const { items, meta: m } = await getAssets({
        page,
        limit: 20,
        q: qDebounced || undefined,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
      });
      setAssets(items);
      setMeta(m);
      setListError('');
    } catch (err) {
      setListError(parseApiError(err, 'Không tải được danh sách tài sản.').message);
    } finally {
      setLoading(false);
    }
  }, [canViewList, page, qDebounced, statusFilter, categoryFilter]);

  const loadMyAssets = useCallback(async () => {
    setMyLoading(true);
    try {
      const { items } = await getMyAssets();
      setMyAssets(items);
    } catch {
      setMyAssets([]);
    } finally {
      setMyLoading(false);
    }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);
  useEffect(() => { loadMyAssets(); }, [loadMyAssets]);

  useEffect(() => {
    if (!canWrite) return;
    getEmployees({ limit: 100 })
      .then(({ items }) => setEmployees(items.filter((e) => e.status !== 'resigned')))
      .catch(() => setEmployees([]));
  }, [canWrite]);

  const refreshAll = () => { loadAssets(); loadMyAssets(); };

  const openHistory = async (asset) => {
    setHistoryModal({ asset, items: [], loading: true });
    try {
      const { items } = await getAssetHistory(asset.id);
      setHistoryModal({ asset, items, loading: false });
    } catch {
      setHistoryModal({ asset, items: [], loading: false });
    }
  };

  const handleAssetSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (assetModal?.initial) {
        await updateAsset(assetModal.initial.id, payload);
        setSuccess('Đã cập nhật tài sản.');
      } else {
        await createAsset(payload);
        setSuccess('Đã thêm tài sản mới.');
      }
      setAssetModal(null);
      refreshAll();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignSubmit = async (payload) => {
    setSubmitting(true);
    try {
      await assignAsset(assignModal.id, payload);
      setSuccess(`Đã cấp phát ${assignModal.code} cho nhân viên.`);
      setAssignModal(null);
      refreshAll();
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async () => {
    if (!returnModal?.holder?.assignment_id) return;
    setSubmitting(true);
    setReturnError('');
    try {
      await returnAssignment(returnModal.holder.assignment_id, { note: returnNote.trim() || undefined });
      setSuccess(`Đã thu hồi ${returnModal.code}.`);
      setReturnModal(null);
      setReturnNote('');
      refreshAll();
    } catch (err) {
      setReturnError(parseApiError(err, 'Không thu hồi được tài sản.').message);
    } finally {
      setSubmitting(false);
    }
  };

  const tableHead = (
    <thead>
      <tr className="bg-gray-50">
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Mã</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tài sản</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Loại</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Trạng thái</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Người đang giữ</th>
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ngày mua</th>
        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Thao tác</th>
      </tr>
    </thead>
  );

  return (
    <div className="page-shell">
      <PageHeader
        title="Tài sản"
        subtitle="Quản lý tài sản công ty, cấp phát và thu hồi cho nhân viên."
        actions={
          canWrite && tab === 'all' ? (
            <Button onClick={() => setAssetModal({ initial: null })}>
              <IconPlus size={16} /> Thêm tài sản
            </Button>
          ) : null
        }
      />

      {success && (
        <div className="mb-4">
          <Alert tone="success">{success}</Alert>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 inline-flex rounded-lg border border-gray-200 bg-white p-1">
        {canViewList && (
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`rounded-md px-3.5 py-1.5 text-sm ${tab === 'all' ? 'bg-brand-50 font-medium text-brand-700' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Tất cả tài sản
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab('mine')}
          className={`rounded-md px-3.5 py-1.5 text-sm ${tab === 'mine' ? 'bg-brand-50 font-medium text-brand-700' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Tài sản của tôi{myAssets.length ? ` (${myAssets.length})` : ''}
        </button>
      </div>

      {tab === 'all' && canViewList && (
        <>
          {/* Thanh lọc */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <IconSearch size={16} />
              </span>
              <Input
                className="pl-9"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="Tìm theo mã, tên, serial..."
              />
            </div>
            <Select
              className="w-auto"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">Mọi trạng thái</option>
              {Object.entries(STATUS_META).map(([value, m]) => (
                <option key={value} value={value}>{m.label}</option>
              ))}
            </Select>
            <Select
              className="w-auto"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            >
              <option value="">Mọi loại tài sản</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </div>

          {listError && (
            <div className="mb-4"><Alert tone="error">{listError}</Alert></div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-card">
            {loading ? (
              <TableSkeleton />
            ) : assets.length === 0 ? (
              <EmptyState
                title="Chưa có tài sản nào"
                description="Chưa có tài sản khớp với điều kiện lọc hiện tại."
                action={canWrite ? <Button onClick={() => setAssetModal({ initial: null })}>Thêm tài sản</Button> : undefined}
              />
            ) : (
              <table className="w-full text-sm">
                {tableHead}
                <tbody>
                  {assets.map((asset) => {
                    const metaStatus = STATUS_META[asset.status] || STATUS_META.available;
                    return (
                      <tr key={asset.id} className="border-t border-gray-100 transition hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium tabular-nums text-gray-900">{asset.code}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{asset.name}</div>
                          <div className="text-[13px] text-gray-500">{asset.serial ? `Serial: ${asset.serial}` : 'Chưa có serial'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{categoryLabel(asset.category)}</td>
                        <td className="px-4 py-3"><Badge tone={metaStatus.tone} dot>{metaStatus.label}</Badge></td>
                        <td className="px-4 py-3">
                          {asset.holder ? (
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                                {initials(asset.holder.employee_name)}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-gray-900">{asset.holder.employee_name || '—'}</span>
                                <span className="block text-[13px] text-gray-500">{asset.holder.employee_code || ''}</span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gray-700">{fmtDate(asset.purchase_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {canWrite && asset.status === 'available' && (
                              <Button size="sm" onClick={() => setAssignModal(asset)}>Cấp phát</Button>
                            )}
                            {canWrite && asset.status === 'assigned' && asset.holder && (
                              <Button size="sm" variant="secondary" onClick={() => { setReturnModal(asset); setReturnError(''); setReturnNote(''); }}>
                                Thu hồi
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => openHistory(asset)}>Lịch sử</Button>
                            {canWrite && (
                              <GhostIconButton label="Sửa tài sản" onClick={() => setAssetModal({ initial: asset })} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>Trang <span className="tabular-nums font-medium text-gray-900">{meta.page}</span> / <span className="tabular-nums">{meta.totalPages}</span> — tổng <span className="tabular-nums">{meta.totalItems}</span> tài sản</span>
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trước</Button>
                <Button size="sm" variant="secondary" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Sau</Button>
              </span>
            </div>
          )}
        </>
      )}

      {tab === 'mine' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-card">
          {myLoading ? (
            <TableSkeleton />
          ) : myAssets.length === 0 ? (
            <EmptyState
              title="Bạn chưa giữ tài sản nào"
              description="Khi được cấp phát laptop, màn hình hay thiết bị, chúng sẽ hiện ở đây."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Mã</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tài sản</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Loại</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ngày nhận</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ghi chú</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {myAssets.map((item) => (
                  <tr key={item.assignment_id || item.id} className="border-t border-gray-100 transition hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium tabular-nums text-gray-900">{item.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-[13px] text-gray-500">{item.serial ? `Serial: ${item.serial}` : 'Chưa có serial'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{categoryLabel(item.category)}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">{fmtDateTime(item.assigned_at)}</td>
                    <td className="px-4 py-3 text-gray-700">{item.assignment_note || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openHistory(item)}>Lịch sử</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal tạo / sửa tài sản */}
      <Modal
        open={Boolean(assetModal)}
        title={assetModal?.initial ? 'Sửa tài sản' : 'Thêm tài sản'}
        onClose={() => setAssetModal(null)}
      >
        {assetModal && (
          <AssetForm
            initial={assetModal.initial}
            submitting={submitting}
            onCancel={() => setAssetModal(null)}
            onSubmit={handleAssetSubmit}
          />
        )}
      </Modal>

      {/* Modal cấp phát */}
      <Modal
        open={Boolean(assignModal)}
        title="Cấp phát tài sản"
        onClose={() => setAssignModal(null)}
      >
        {assignModal && (
          <AssignForm
            asset={assignModal}
            employees={employees}
            submitting={submitting}
            onCancel={() => setAssignModal(null)}
            onSubmit={handleAssignSubmit}
          />
        )}
      </Modal>

      {/* Modal thu hồi */}
      <Modal
        open={Boolean(returnModal)}
        title="Thu hồi tài sản"
        onClose={() => setReturnModal(null)}
      >
        {returnModal && (
          <div className="space-y-4">
            {returnError && <Alert tone="error">{returnError}</Alert>}
            <p className="text-sm leading-relaxed text-gray-600">
              Thu hồi <span className="font-medium text-gray-900">{returnModal.code} — {returnModal.name}</span>
              {returnModal.holder ? (
                <> từ <span className="font-medium text-gray-900">{returnModal.holder.employee_name}</span> (nhận lúc {fmtDateTime(returnModal.holder.assigned_at)}).</>
              ) : '.'}
              {' '}Tài sản sẽ quay về trạng thái sẵn sàng.
            </p>
            <FormField label="Ghi chú thu hồi">
              <Textarea value={returnNote} onChange={(e) => setReturnNote(e.target.value)} rows={2} placeholder="VD: Máy hoạt động tốt, đủ sạc" />
            </FormField>
            <div className="flex justify-end gap-2.5 pt-1">
              <Button variant="secondary" onClick={() => setReturnModal(null)} disabled={submitting}>Huỷ</Button>
              <Button loading={submitting} disabled={submitting} onClick={handleReturn}>
                {submitting ? 'Đang thu hồi...' : 'Xác nhận thu hồi'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal lịch sử cấp phát */}
      <Modal
        open={Boolean(historyModal)}
        title={historyModal ? `Lịch sử cấp phát — ${historyModal.asset.code}` : 'Lịch sử cấp phát'}
        subtitle={historyModal?.asset?.name}
        onClose={() => setHistoryModal(null)}
        width="max-w-xl"
      >
        {historyModal && (
          historyModal.loading ? (
            <p className="py-6 text-center text-sm text-gray-500">Đang tải lịch sử...</p>
          ) : historyModal.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Tài sản này chưa từng được cấp phát.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {historyModal.items.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                      {initials(h.employee_name)}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-gray-900">{h.employee_name || '—'} {h.employee_code ? <span className="font-normal text-gray-500">({h.employee_code})</span> : null}</span>
                      <span className="block text-[13px] text-gray-500">
                        Nhận: {fmtDateTime(h.assigned_at)} · Trả: {h.returned_at ? fmtDateTime(h.returned_at) : '—'}
                      </span>
                      {h.note && <span className="block text-[13px] text-gray-500">Ghi chú: {h.note}</span>}
                    </span>
                  </div>
                  <Badge tone={h.status === 'active' ? 'green' : 'slate'} dot>
                    {h.status === 'active' ? 'Đang giữ' : 'Đã trả'}
                  </Badge>
                </li>
              ))}
            </ul>
          )
        )}
      </Modal>
    </div>
  );
}
