import { useCallback, useEffect, useState } from 'react';
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
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncements,
  updateAnnouncement,
} from '../services';

// ============================================================
// Trang Thông báo công ty — route "/announcements" — Design v4
// - Danh sách phẳng theo thời gian, thông báo ghim (isPinned) luôn
//   ở đầu và có Badge "Đã ghim"; Badge loại theo category.
// - HR/Admin: đăng thông báo mới (đồng thời phát Notification cho
//   toàn bộ nhân viên đang làm việc), sửa, xoá.
// ============================================================

const CATEGORY_META = {
  general: { label: 'Chung', tone: 'slate' },
  policy: { label: 'Chính sách', tone: 'blue' },
  event: { label: 'Sự kiện', tone: 'teal' },
};

const EMPTY_FORM = { title: '', content: '', category: 'general', is_pinned: false };

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function errorMessage(error, fallback) {
  return error?.response?.data?.error?.message || fallback;
}

export default function AnnouncementsPage() {
  const { user: authUser } = useAuth();
  const user = authUser || getCurrentUser();
  const canWrite = user?.role === 'admin' || user?.role === 'hr';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  // Modal tạo/sửa: editing = null (đóng) | 'create' | object announcement.
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { items: rows } = await getAnnouncements({ limit: 100 });
      setItems(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setLoadError(errorMessage(error, 'Không tải được danh sách thông báo.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setEditing('create');
  };

  const openEdit = (item) => {
    setForm({
      title: item.title || '',
      content: item.content || '',
      category: item.category || 'general',
      is_pinned: Boolean(item.isPinned),
    });
    setFormError('');
    setEditing(item);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setFormError('Tiêu đề và nội dung không được để trống.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category,
        is_pinned: form.is_pinned,
      };
      if (editing === 'create') {
        await createAnnouncement(payload);
      } else {
        await updateAnnouncement(editing.id, payload);
      }
      setEditing(null);
      await load();
    } catch (error) {
      setFormError(errorMessage(error, 'Không lưu được thông báo.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setActionError('');
    try {
      await deleteAnnouncement(deleting.id);
      setDeleting(null);
      await load();
    } catch (error) {
      setActionError(errorMessage(error, 'Không xoá được thông báo.'));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Thông báo"
        subtitle="Thông tin chính thức từ công ty — chính sách, sự kiện và thông báo chung cho toàn thể nhân viên."
        actions={
          canWrite ? (
            <Button variant="primary" onClick={openCreate}>
              Đăng thông báo
            </Button>
          ) : null
        }
      />

      {actionError ? (
        <Alert tone="error" className="mb-4">
          {actionError}
        </Alert>
      ) : null}

      {loading ? (
        <div className="space-y-4" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
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
            title="Chưa có thông báo nào"
            description={
              canWrite
                ? 'Đăng thông báo đầu tiên để mọi nhân viên cùng nắm thông tin.'
                : 'Khi có thông báo mới từ công ty, chúng sẽ hiện ở đây.'
            }
            action={
              canWrite ? (
                <Button variant="primary" size="sm" onClick={openCreate}>
                  Đăng thông báo
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const category = CATEGORY_META[item.category] || CATEGORY_META.general;
            return (
              <Card key={item.id}>
                <CardBody className="py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={category.tone} dot>
                      {category.label}
                    </Badge>
                    {item.isPinned ? (
                      <Badge tone="amber" dot>
                        Đã ghim
                      </Badge>
                    ) : null}
                    <span className="ml-auto text-[13px] tabular-nums text-gray-400">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <h2 className="mt-2.5 text-base font-semibold text-gray-900">{item.title}</h2>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                    {item.content}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                    <span className="text-[13px] text-gray-500">
                      Người đăng: {item.authorName || 'Phòng nhân sự'}
                    </span>
                    {canWrite ? (
                      <span className="ml-auto flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(item)}>
                          Sửa
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setDeleting(item)}>
                          Xoá
                        </Button>
                      </span>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {editing ? (
        <Modal
          title={editing === 'create' ? 'Đăng thông báo mới' : 'Sửa thông báo'}
          subtitle={
            editing === 'create'
              ? 'Thông báo mới sẽ được gửi tới chuông thông báo của mọi nhân viên đang làm việc.'
              : undefined
          }
          onClose={() => setEditing(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Huỷ
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : editing === 'create' ? 'Đăng thông báo' : 'Lưu thay đổi'}
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
            <FormField label="Tiêu đề">
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ví dụ: Lịch nghỉ lễ 30/4 - 1/5"
                maxLength={255}
              />
            </FormField>
            <FormField label="Loại thông báo">
              <Select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="general">Chung</option>
                <option value="policy">Chính sách</option>
                <option value="event">Sự kiện</option>
              </Select>
            </FormField>
            <FormField label="Nội dung">
              <Textarea
                rows={5}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Nội dung chi tiết của thông báo..."
              />
            </FormField>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 accent-brand-600"
                checked={form.is_pinned}
                onChange={(e) => setForm((f) => ({ ...f, is_pinned: e.target.checked }))}
              />
              Ghim thông báo này lên đầu danh sách
            </label>
          </div>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal
          title="Xoá thông báo"
          onClose={() => setDeleting(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Huỷ
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Đang xoá...' : 'Xoá thông báo'}
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-gray-600">
            Bạn chắc chắn muốn xoá thông báo “{deleting.title}”? Hành động này không thể hoàn tác.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
