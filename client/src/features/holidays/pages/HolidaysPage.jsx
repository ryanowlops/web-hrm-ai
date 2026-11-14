import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../../components/ui';
import { getCurrentUser } from '../../auth/services';
import { createHoliday, deleteHoliday, getHolidays } from '../services';

// ============================================================
// Trang Ngày lễ — route "/holidays" (dự kiến) — Design v4
// - Danh sách ngày lễ theo năm, nhóm theo tháng, sắp theo ngày.
// - Admin/HR: thêm ngày lễ (ngày + tên + mô tả + lễ quốc gia/công ty),
//   xoá. Mọi role đã đăng nhập đều xem được (quyền ghi kiểm ở API).
// - Chưa nối vào tính nghỉ phép / lương — bước nối riêng sau.
// ============================================================

const EMPTY_FORM = { date: '', name: '', description: '', is_national: true };

function parseLocalDate(value) {
  // "YYYY-MM-DD" -> Date giờ địa phương (tránh lệch ngày do UTC).
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFullDate(value) {
  const date = parseLocalDate(value);
  if (!date) return String(value || '');
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatMonthKey(value) {
  const date = parseLocalDate(value);
  if (!date) return '';
  const label = date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message || fallback;
}

export default function HolidaysPage() {
  const { user: authUser } = useAuth();
  const user = authUser || getCurrentUser();
  const canWrite = user?.role === 'admin' || user?.role === 'hr';

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => [currentYear - 1, currentYear, currentYear + 1, currentYear + 2],
    [currentYear],
  );
  const [year, setYear] = useState(currentYear);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  // Modal thêm mới và modal xác nhận xoá.
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { items: rows } = await getHolidays({ year, limit: 100 });
      setItems(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setLoadError(errorMessage(error, 'Không tải được danh sách ngày lễ.'));
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  // Nhóm các ngày lễ theo tháng (API đã trả theo ngày tăng dần).
  const grouped = useMemo(() => {
    const groups = [];
    items.forEach((item) => {
      const month = formatMonthKey(item.date);
      const last = groups[groups.length - 1];
      if (last && last.month === month) {
        last.items.push(item);
      } else {
        groups.push({ month, items: [item] });
      }
    });
    return groups;
  }, [items]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setCreating(true);
  };

  const handleSave = async () => {
    if (!form.date || !form.name.trim()) {
      setFormError('Ngày và tên ngày lễ không được để trống.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await createHoliday({
        date: form.date,
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_national: form.is_national,
      });
      setCreating(false);
      await load();
    } catch (error) {
      setFormError(errorMessage(error, 'Không lưu được ngày lễ.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setActionError('');
    try {
      await deleteHoliday(deleting.id);
      setDeleting(null);
      await load();
    } catch (error) {
      setActionError(errorMessage(error, 'Không xoá được ngày lễ.'));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Ngày lễ"
        subtitle="Lịch nghỉ lễ của công ty — admin/HR thêm, xoá và xem lại các ngày lễ theo từng năm."
        actions={
          canWrite ? (
            <Button variant="primary" onClick={openCreate}>
              Thêm ngày lễ
            </Button>
          ) : null
        }
      />

      {actionError ? (
        <Alert tone="error" className="mb-4">
          {actionError}
        </Alert>
      ) : null}

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center gap-3 py-4">
          <FormField label="Năm" className="mb-0 w-40">
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </FormField>
          <span className="ml-auto text-[13px] text-gray-500">
            {items.length} ngày lễ trong năm {year}
          </span>
        </CardBody>
      </Card>

      {loading ? (
        <div className="space-y-4" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      ) : loadError ? (
        <Card>
          <CardBody className="py-5">
            <Alert tone="error">{loadError}</Alert>
            <Button variant="secondary" size="sm" className="mt-4" onClick={load}>
              Thử lại
            </Button>
          </CardBody>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title={`Chưa có ngày lễ nào trong năm ${year}`}
            description={
              canWrite
                ? 'Thêm ngày lễ đầu tiên của năm để mọi người cùng nắm lịch nghỉ.'
                : 'Khi admin thêm ngày lễ mới, chúng sẽ hiện ở đây.'
            }
            action={
              canWrite ? (
                <Button variant="primary" size="sm" onClick={openCreate}>
                  Thêm ngày lễ
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.month}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {group.month}
              </h2>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <Card key={item.id}>
                    <CardBody className="py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-gray-900">{item.name}</p>
                          <p className="mt-0.5 text-sm text-gray-500">{formatFullDate(item.date)}</p>
                          {item.description ? (
                            <p className="mt-1 text-sm leading-relaxed text-gray-600">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                        <span className="ml-auto flex items-center gap-2">
                          <Badge tone={item.isNational ? 'blue' : 'teal'} dot>
                            {item.isNational ? 'Lễ quốc gia' : 'Lễ công ty'}
                          </Badge>
                          {canWrite ? (
                            <Button variant="danger" size="sm" onClick={() => setDeleting(item)}>
                              Xoá
                            </Button>
                          ) : null}
                        </span>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <Modal
          title="Thêm ngày lễ"
          onClose={() => setCreating(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Huỷ
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Thêm ngày lễ'}
              </Button>
            </>
          }
        >
          {formError ? (
            <Alert tone="error" className="mb-4">
              {formError}
            </Alert>
          ) : null}
          <div className="space-y-4">
            <FormField label="Ngày lễ">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </FormField>
            <FormField label="Tên ngày lễ">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ví dụ: Tết Dương lịch"
                maxLength={255}
              />
            </FormField>
            <FormField label="Ghi chú (không bắt buộc)">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Mô tả ngắn về ngày lễ..."
              />
            </FormField>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 accent-brand-600"
                checked={form.is_national}
                onChange={(e) => setForm((f) => ({ ...f, is_national: e.target.checked }))}
              />
              Lễ quốc gia (bỏ chọn nếu là ngày lễ riêng của công ty)
            </label>
          </div>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal
          title="Xoá ngày lễ"
          onClose={() => setDeleting(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Huỷ
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Đang xoá...' : 'Xoá ngày lễ'}
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-gray-600">
            Bạn chắc chắn muốn xoá ngày lễ “{deleting.name}” (
            {formatFullDate(deleting.date)})? Hành động này không thể hoàn tác.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
