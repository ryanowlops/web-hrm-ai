// Trang Đào tạo nội bộ — route /training
// - HR/Admin: bảng khoá học phẳng (tạo/sửa/xoá), gán học viên, xem tiến độ lớp.
// - Employee/Manager: "Khoá học của tôi" — thẻ tiến độ phẳng, bắt đầu học,
//   cập nhật % tiến độ, hoàn thành (100% tự chốt ở server).
// Trình bày theo hợp đồng thiết kế v4: PageHeader phẳng, thẻ/bảng border
// gray-200 rounded-xl, thanh tiến độ bg-gray-100 fill brand-600, UI kit.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  Button,
  Card,
  Badge,
  Modal,
  PageHeader,
  EmptyState,
  Alert,
  FormField,
  Input,
  Select,
  Textarea,
  Skeleton,
  TableSkeleton,
} from '../../../components/ui';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconUsers,
  IconClipboard,
  IconCheck,
  IconSearch,
} from '../../../components/icons.jsx';
import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseEnrollments,
  enrollEmployees,
  getMyCourses,
  updateEnrollment,
  parseApiError,
} from '../services';
import { getEmployees } from '../../employees/services';

const STATUS_META = {
  assigned: { label: 'Chưa bắt đầu', tone: 'slate' },
  in_progress: { label: 'Đang học', tone: 'blue' },
  completed: { label: 'Đã hoàn thành', tone: 'green' },
};

function getRoleFallback() {
  try {
    const raw = localStorage.getItem('hrm_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.role) return u.role;
    }
    const token = localStorage.getItem('hrm_access_token');
    if (token && token.split('.').length === 3) {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role) return payload.role;
    }
  } catch {
    /* bỏ qua */
  }
  return null;
}

function formatHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${Number.isInteger(n) ? n : n.toFixed(1)} giờ`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN');
}

function ProgressBar({ value, className = '' }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className={`h-2 w-full rounded-full bg-gray-100 ${className}`}>
      <div
        className="h-2 rounded-full bg-brand-600 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function GhostIconButton({ label, danger = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 transition duration-150 ${
        danger
          ? 'text-gray-400 hover:bg-red-50 hover:text-red-700'
          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {label === 'Sửa' ? <IconEdit size={16} /> : <IconTrash size={16} />}
    </button>
  );
}

const errorInputClass = (hasError) =>
  hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/15' : '';

// ===========================================================================
// View HR/Admin — quản lý khoá học
// ===========================================================================

function ManagerTrainingView() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const [courseModal, setCourseModal] = useState(null); // { mode: 'create'|'edit', course? }
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    duration_hours: '',
    is_mandatory: false,
    is_active: true,
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [enrollCourse, setEnrollCourse] = useState(null);
  const [progressCourse, setProgressCourse] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 100 };
      if (search.trim()) params.search = search.trim();
      if (activeFilter === 'active') params.is_active = true;
      if (activeFilter === 'inactive') params.is_active = false;
      const { items } = await getCourses(params);
      setCourses(items);
    } catch (err) {
      setError(parseApiError(err, 'Không tải được danh sách khoá học.').message);
    } finally {
      setLoading(false);
    }
  }, [search, activeFilter]);

  useEffect(() => {
    const t = setTimeout(loadCourses, 250);
    return () => clearTimeout(t);
  }, [loadCourses]);

  const openCreate = () => {
    setForm({
      title: '',
      description: '',
      category: '',
      duration_hours: '',
      is_mandatory: false,
      is_active: true,
    });
    setFieldErrors({});
    setFormError('');
    setCourseModal({ mode: 'create' });
  };

  const openEdit = (course) => {
    setForm({
      title: course.title || '',
      description: course.description || '',
      category: course.category || '',
      duration_hours: course.duration_hours ?? '',
      is_mandatory: Boolean(course.is_mandatory),
      is_active: Boolean(course.is_active),
    });
    setFieldErrors({});
    setFormError('');
    setCourseModal({ mode: 'edit', course });
  };

  const submitCourse = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    setFieldErrors({});
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      duration_hours: form.duration_hours === '' ? 0 : Number(form.duration_hours),
      is_mandatory: form.is_mandatory,
      is_active: form.is_active,
    };
    try {
      if (courseModal.mode === 'edit') {
        await updateCourse(courseModal.course.id, payload);
      } else {
        await createCourse(payload);
      }
      setCourseModal(null);
      await loadCourses();
    } catch (err) {
      const parsed = parseApiError(err, 'Không lưu được khoá học.');
      setFormError(parsed.message);
      setFieldErrors(parsed.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCourse(deleteTarget.id);
      setDeleteTarget(null);
      await loadCourses();
    } catch (err) {
      setError(parseApiError(err, 'Không xoá được khoá học.').message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Đào tạo"
        subtitle="Khoá học nội bộ: tạo khoá, gán học viên và theo dõi tiến độ hoàn thành."
        actions={
          <Button onClick={openCreate}>
            <IconPlus size={16} /> Tạo khoá học
          </Button>
        }
      />

      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <IconSearch size={16} />
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên khoá, nhóm khoá..."
              className="pl-9"
            />
          </div>
          <Select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="w-44"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang mở</option>
            <option value="inactive">Đã tắt</option>
          </Select>
        </div>
      </Card>

      <Card>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : courses.length === 0 ? (
          <EmptyState
            icon={<IconClipboard size={22} />}
            title="Chưa có khoá học nào"
            description="Tạo khoá học đầu tiên rồi gán cho học viên để bắt đầu đào tạo."
            actions={<Button onClick={openCreate}>Tạo khoá học</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-3">Khoá học</th>
                  <th className="px-4 py-3">Thời lượng</th>
                  <th className="px-4 py-3">Học viên</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{course.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
                        <span>{course.category || 'Chưa phân nhóm'}</span>
                        {course.is_mandatory && (
                          <Badge tone="amber" dot>
                            Bắt buộc
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">
                      {formatHours(course.duration_hours)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setProgressCourse(course)}
                        className="tabular-nums font-medium text-brand-700 hover:underline"
                        title="Xem tiến độ học viên"
                      >
                        {course.enrollment_total ?? 0} học viên
                      </button>
                      <div className="text-[13px] text-gray-500">
                        {course.enrollment_completed ?? 0} đã hoàn thành
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {course.is_active ? (
                        <Badge tone="green" dot>
                          Đang mở
                        </Badge>
                      ) : (
                        <Badge tone="slate" dot>
                          Đã tắt
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEnrollCourse(course)}
                          disabled={!course.is_active}
                          title={course.is_active ? 'Gán học viên' : 'Khoá đang tắt'}
                        >
                          <IconUsers size={15} /> Gán học viên
                        </Button>
                        <GhostIconButton label="Sửa" onClick={() => openEdit(course)} />
                        <GhostIconButton
                          label="Xoá"
                          danger
                          onClick={() => setDeleteTarget(course)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal tạo / sửa khoá học */}
      <Modal
        open={Boolean(courseModal)}
        title={courseModal?.mode === 'edit' ? 'Sửa khoá học' : 'Tạo khoá học'}
        onClose={() => setCourseModal(null)}
        width="max-w-xl"
      >
        <form onSubmit={submitCourse} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <FormField label="Tên khoá học" required error={fieldErrors.title}>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="VD: An toàn thông tin cho nhân viên mới"
              className={errorInputClass(Boolean(fieldErrors.title))}
            />
          </FormField>
          <FormField label="Mô tả" error={fieldErrors.description}>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Nội dung, đối tượng và mục tiêu của khoá học..."
              rows={3}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nhóm khoá học" error={fieldErrors.category}>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="VD: Hội nhập, Chuyên môn, Kỹ năng mềm"
              />
            </FormField>
            <FormField label="Thời lượng (giờ)" error={fieldErrors.duration_hours}>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={form.duration_hours}
                onChange={(e) => setForm({ ...form, duration_hours: e.target.value })}
                placeholder="VD: 4"
                className={errorInputClass(Boolean(fieldErrors.duration_hours))}
              />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_mandatory}
                onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 accent-brand-600"
              />
              Khoá bắt buộc
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 accent-brand-600"
              />
              Đang mở (hiển thị với nhân viên)
            </label>
          </div>
          <div className="flex justify-end gap-2.5 pt-1">
            <Button type="button" variant="secondary" onClick={() => setCourseModal(null)} disabled={submitting}>
              Huỷ
            </Button>
            <Button type="submit" loading={submitting} disabled={submitting}>
              {submitting ? 'Đang lưu...' : courseModal?.mode === 'edit' ? 'Lưu thay đổi' : 'Tạo khoá học'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal gán học viên */}
      {enrollCourse && (
        <EnrollModal
          course={enrollCourse}
          onClose={() => setEnrollCourse(null)}
          onDone={loadCourses}
        />
      )}

      {/* Modal tiến độ học viên của khoá */}
      {progressCourse && (
        <CourseProgressModal course={progressCourse} onClose={() => setProgressCourse(null)} />
      )}

      {/* Modal xác nhận xoá */}
      <Modal
        open={Boolean(deleteTarget)}
        title="Xoá khoá học"
        onClose={() => setDeleteTarget(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Huỷ
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting} disabled={deleting}>
              {deleting ? 'Đang xoá...' : 'Xoá khoá học'}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-gray-600">
          Xoá khoá học <strong className="text-gray-900">{deleteTarget?.title}</strong> và toàn bộ
          ghi danh/tiến độ của học viên trong khoá này? Hành động này không hoàn tác được.
        </p>
      </Modal>
    </div>
  );
}

// Modal gán học viên: chọn từ danh sách nhân viên, người đã ghi danh bị khoá.
function EnrollModal({ course, onClose, onDone }) {
  const [employees, setEmployees] = useState([]);
  const [enrolledIds, setEnrolledIds] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ items: emps }, { items: enrollments }] = await Promise.all([
          getEmployees({ limit: 100 }),
          getCourseEnrollments(course.id),
        ]);
        if (cancelled) return;
        setEmployees(emps);
        setEnrolledIds(new Set(enrollments.map((e) => e.employee_id)));
      } catch (err) {
        if (!cancelled) setError(parseApiError(err, 'Không tải được danh sách nhân viên.').message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [course.id]);

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return employees;
    return employees.filter(
      (e) =>
        (e.full_name || '').toLowerCase().includes(kw) ||
        (e.code || '').toLowerCase().includes(kw) ||
        (e.department_name || '').toLowerCase().includes(kw),
    );
  }, [employees, keyword]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const { meta } = await enrollEmployees(course.id, Array.from(selected));
      const created = meta?.created ?? selected.size;
      const skipped = (meta?.skipped_employee_ids || []).length;
      setResultMsg(
        `Đã gán ${created} học viên${skipped ? `, bỏ qua ${skipped} người đã có trong khoá` : ''}. Học viên sẽ nhận được thông báo.`,
      );
      setSelected(new Set());
      setEnrolledIds((prev) => new Set([...prev, ...selected]));
      onDone?.();
    } catch (err) {
      setError(parseApiError(err, 'Không gán được học viên.').message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open title={`Gán học viên — ${course.title}`} onClose={onClose} width="max-w-xl">
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {resultMsg && <Alert tone="success">{resultMsg}</Alert>}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <IconSearch size={16} />
          </span>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm nhân viên theo tên, mã, phòng ban..."
            className="pl-9"
          />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : visible.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Không có nhân viên phù hợp.</p>
          ) : (
            visible.map((emp) => {
              const already = enrolledIds.has(emp.id);
              const resigned = emp.status === 'resigned';
              const disabled = already || resigned;
              return (
                <label
                  key={emp.id}
                  className={`flex items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-b-0 ${
                    disabled ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={already || selected.has(emp.id)}
                    onChange={() => toggle(emp.id)}
                    className="h-4 w-4 rounded border-gray-300 accent-brand-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {emp.full_name}
                    </span>
                    <span className="block text-[13px] text-gray-500">
                      {emp.code}
                      {emp.department_name ? ` · ${emp.department_name}` : ''}
                    </span>
                  </span>
                  {already && <Badge tone="green">Đã gán</Badge>}
                  {resigned && !already && <Badge tone="red">Đã nghỉ việc</Badge>}
                </label>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-gray-500">Đã chọn {selected.size} nhân viên</span>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Đóng
            </Button>
            <Button onClick={submit} loading={submitting} disabled={submitting || selected.size === 0}>
              {submitting ? 'Đang gán...' : 'Gán học viên'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Modal xem tiến độ học viên trong một khoá (HR/Admin/Manager).
function CourseProgressModal({ course, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { items: rows } = await getCourseEnrollments(course.id);
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) setError(parseApiError(err, 'Không tải được tiến độ học viên.').message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [course.id]);

  return (
    <Modal open title={`Tiến độ — ${course.title}`} onClose={onClose} width="max-w-xl">
      {error && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">
          Khoá học chưa có học viên nào được gán.
        </p>
      ) : (
        <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
          {items.map((enr) => {
            const meta = STATUS_META[enr.status] || STATUS_META.assigned;
            return (
              <div key={enr.id} className="rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {enr.employee_name || `Nhân viên #${enr.employee_id}`}
                    </div>
                    <div className="text-[13px] text-gray-500">{enr.employee_code || ''}</div>
                  </div>
                  <Badge tone={meta.tone} dot>
                    {meta.label}
                  </Badge>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <ProgressBar value={enr.progress} className="flex-1" />
                  <span className="w-10 text-right text-[13px] font-medium tabular-nums text-gray-700">
                    {enr.progress}%
                  </span>
                </div>
                {enr.status === 'completed' && enr.completed_at && (
                  <div className="mt-1.5 text-[13px] text-gray-500">
                    Hoàn thành ngày {formatDate(enr.completed_at)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ===========================================================================
// View Employee/Manager — khoá học của tôi
// ===========================================================================

function MyTrainingView() {
  const [items, setItems] = useState([]);
  const [openCourses, setOpenCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({}); // enrollmentId -> progress dang nhap
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ items: mine }, { items: all }] = await Promise.all([
        getMyCourses(),
        getCourses({ limit: 100 }),
      ]);
      setItems(mine);
      setOpenCourses(all);
    } catch (err) {
      setError(parseApiError(err, 'Không tải được danh sách khoá học của bạn.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (enrollment, payload) => {
    setSavingId(enrollment.id);
    setError('');
    try {
      const updated = await updateEnrollment(enrollment.id, payload);
      setItems((prev) =>
        prev.map((it) =>
          it.id === enrollment.id
            ? { ...it, ...updated, course: updated.course || it.course }
            : it,
        ),
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[enrollment.id];
        return next;
      });
    } catch (err) {
      setError(parseApiError(err, 'Không cập nhật được tiến độ.').message);
    } finally {
      setSavingId(null);
    }
  };

  const completedCount = items.filter((i) => i.status === 'completed').length;
  const inProgressCount = items.filter((i) => i.status === 'in_progress').length;

  return (
    <div className="page-shell">
      <PageHeader
        title="Đào tạo"
        subtitle={
          items.length > 0
            ? `Bạn có ${items.length} khoá học được gán · ${completedCount} đã hoàn thành · ${inProgressCount} đang học.`
            : 'Các khoá học nội bộ được gán cho bạn và tiến độ học của bạn.'
        }
      />

      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconClipboard size={22} />}
          title="Bạn chưa được gán khoá học nào"
          description="Khi HR gán khoá học, khoá sẽ xuất hiện tại đây kèm thông báo. Trong lúc chờ, bạn có thể xem các khoá đang mở bên dưới."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((enr) => {
            const course = enr.course || {};
            const meta = STATUS_META[enr.status] || STATUS_META.assigned;
            const draft = drafts[enr.id];
            const draftValue = draft !== undefined ? draft : enr.progress;
            const saving = savingId === enr.id;
            return (
              <Card key={enr.id} className="flex flex-col px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] font-semibold leading-snug text-gray-900">
                    {course.title || enr.course_title || 'Khoá học'}
                  </h3>
                  <Badge tone={meta.tone} dot className="shrink-0">
                    {meta.label}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
                  <span>{course.category || 'Chưa phân nhóm'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{formatHours(course.duration_hours)}</span>
                  {course.is_mandatory && (
                    <Badge tone="amber">Bắt buộc</Badge>
                  )}
                </div>
                {course.description && (
                  <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
                    {course.description}
                  </p>
                )}

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span className="text-gray-500">Tiến độ</span>
                    <span className="font-medium tabular-nums text-gray-900">{enr.progress}%</span>
                  </div>
                  <ProgressBar value={enr.progress} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {enr.status === 'assigned' && (
                    <Button size="sm" onClick={() => patch(enr, { status: 'in_progress' })} loading={saving} disabled={saving}>
                      Bắt đầu học
                    </Button>
                  )}
                  {enr.status === 'in_progress' && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={draftValue}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [enr.id]: e.target.value }))
                          }
                          className="h-9 w-20 tabular-nums"
                          aria-label="Tiến độ phần trăm"
                        />
                        <span className="text-[13px] text-gray-500">%</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={saving || draft === undefined || Number(draft) === enr.progress}
                        loading={saving}
                        onClick={() => {
                          const n = Math.max(0, Math.min(100, Number(draft)));
                          if (Number.isFinite(n)) patch(enr, { progress: n });
                        }}
                      >
                        Cập nhật
                      </Button>
                      <Button
                        size="sm"
                        disabled={saving}
                        onClick={() => patch(enr, { status: 'completed' })}
                      >
                        <IconCheck size={15} /> Hoàn thành
                      </Button>
                    </>
                  )}
                  {enr.status === 'completed' && (
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#067647]">
                      <IconCheck size={15} /> Đã hoàn thành
                      {enr.completed_at ? ` · ${formatDate(enr.completed_at)}` : ''}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Khoá đang mở trong công ty (chỉ xem) */}
      {openCourses.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-gray-900">Khoá học đang mở</h2>
            <p className="mt-0.5 text-[13px] text-gray-500">
              Danh sách khoá đào tạo đang mở trong công ty. Liên hệ HR nếu bạn muốn được gán thêm khoá.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {openCourses.map((course) => (
              <div key={course.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">{course.title}</div>
                  <div className="text-[13px] text-gray-500">
                    {course.category || 'Chưa phân nhóm'} · {formatHours(course.duration_hours)}
                  </div>
                </div>
                {course.is_mandatory && <Badge tone="amber">Bắt buộc</Badge>}
                <Badge tone="green" dot>
                  Đang mở
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ===========================================================================
// Trang chính — rẽ nhánh theo vai trò
// ===========================================================================

export default function TrainingPage() {
  const { user } = useAuth();
  const role = user?.role || getRoleFallback();
  if (role === 'admin' || role === 'hr') {
    return <ManagerTrainingView />;
  }
  return <MyTrainingView />;
}
