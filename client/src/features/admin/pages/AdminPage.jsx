import { useCallback, useEffect, useRef, useState } from 'react';
import { listUsers, updateUserRole, setUserActive, friendlyError } from '../services';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  TableSkeleton,
} from '../../../components/ui';

/**
 * Trang Quản trị tài khoản (FR-01, route /admin).
 * - Admin: xem danh sách tài khoản, đổi vai trò (role), khoá/mở khoá tài khoản.
 * - HR: chỉ xem được trong giới hạn backend trả về — mọi thao tác sửa đều do
 *   backend kiểm tra quyền lại; nếu backend từ chối (403), trang báo rõ.
 * Mọi thay đổi đều hỏi xác nhận trước (hộp thoại xác nhận) và hiển thị kết quả
 * thành công/lỗi. Trình bày theo design system v2 (UI kit dùng chung).
 */

const ROLES = [
  { value: 'admin', label: 'Quản trị viên' },
  { value: 'hr', label: 'Nhân sự (HR)' },
  { value: 'manager', label: 'Trưởng phòng' },
  { value: 'employee', label: 'Nhân viên' },
];
const roleLabel = (value) => ROLES.find((r) => r.value === value)?.label || value || '—';

// Màu huy hiệu theo vai trò: admin=violet, hr=blue, manager=amber, employee=slate.
const ROLE_TONES = { admin: 'violet', hr: 'blue', manager: 'amber', employee: 'slate' };
const roleTone = (value) => ROLE_TONES[value] || 'slate';

// Chữ viết tắt hiển thị trong vòng tròn đại diện (chỉ phục vụ trình bày).
function initialsOf(user) {
  const name = (user.full_name || user.email || '').trim();
  if (!name) return '?';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SearchIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
    <path d="m20 20-3.8-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const LockIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="15.2" r="1.6" fill="currentColor" />
  </svg>
);

const UploadIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 16V5m0 0-4 4m4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  // Hộp thoại xác nhận thay cho window.confirm: { kind: 'role' | 'toggle', user, nextRole?, nextActive? }
  const [confirm, setConfirm] = useState(null);
  const [kbNote, setKbNote] = useState('');
  const searchTimer = useRef(null);

  const limit = 20;
  const totalPages = meta?.totalPages || 1;
  const totalItems = meta?.totalItems ?? users.length;

  /* --------------------------- Debounce ô tìm kiếm -------------------------- */
  function handleSearchChange(e) {
    const value = e.target.value;
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
      setPage(1);
    }, 400);
  }

  /* ------------------------------ Tải danh sách ----------------------------- */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { items, meta: m } = await listUsers({
        page,
        limit,
        search: debouncedSearch,
        role: roleFilter,
      });
      setUsers(items);
      setMeta(m);
      setForbidden(false);
    } catch (err) {
      if (err?.response?.status === 403) {
        setForbidden(true);
        setUsers([]);
        setMeta(null);
      } else {
        setError(friendlyError(err, 'Không tải được danh sách tài khoản.'));
      }
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /* -------------------------------- Thao tác ------------------------------- */
  // Mở hộp thoại xác nhận trước khi đổi vai trò (giữ nguyên điều kiện bỏ qua
  // khi vai trò không thay đổi).
  function requestRoleChange(user, nextRole) {
    if (nextRole === user.role) return;
    setConfirm({ kind: 'role', user, nextRole });
  }

  async function handleRoleChange(user, nextRole) {
    const name = user.full_name || user.email;
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      await updateUserRole(user.id, nextRole);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u)));
      setNotice(`Đã đổi vai trò của ${name} thành ${roleLabel(nextRole)}.`);
    } catch (err) {
      setError(friendlyError(err, 'Đổi vai trò thất bại, vui lòng thử lại.'));
      loadUsers();
    } finally {
      setBusyId(null);
    }
  }

  // Mở hộp thoại xác nhận trước khi khoá/mở khoá tài khoản.
  function requestToggleActive(user) {
    const nextActive = !(user.is_active !== false);
    setConfirm({ kind: 'toggle', user, nextActive });
  }

  async function handleToggleActive(user) {
    const nextActive = !(user.is_active !== false);
    const name = user.full_name || user.email;
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      await setUserActive(user.id, nextActive);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: nextActive } : u)),
      );
      setNotice(
        nextActive ? `Đã mở khoá tài khoản ${name}.` : `Đã khoá tài khoản ${name}.`,
      );
    } catch (err) {
      setError(friendlyError(err, 'Thao tác thất bại, vui lòng thử lại.'));
      loadUsers();
    } finally {
      setBusyId(null);
    }
  }

  function executeConfirm() {
    if (!confirm) return;
    const current = confirm;
    setConfirm(null);
    if (current.kind === 'role') {
      handleRoleChange(current.user, current.nextRole);
    } else {
      handleToggleActive(current.user);
    }
  }

  const confirmName = confirm ? confirm.user.full_name || confirm.user.email : '';

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Hệ thống"
        title="Quản trị tài khoản"
        subtitle="Quản lý tài khoản đăng nhập hệ thống: đổi vai trò và khoá/mở khoá tài khoản. Phân quyền được kiểm tra ở máy chủ — quản trị viên (Admin) thao tác được toàn bộ, HR chỉ xem trong giới hạn được cấp."
      />

      {(error || notice) && (
        <div className="mb-5 space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
        </div>
      )}

      {forbidden ? (
        <Card className="animate-fade-up">
          <EmptyState
            icon={LockIcon}
            title="Bạn không có quyền xem danh sách tài khoản"
            description="Khu vực này chỉ dành cho quản trị viên (Admin). Nếu bạn cần đổi vai trò hoặc khoá/mở tài khoản, vui lòng liên hệ Admin của hệ thống."
          />
        </Card>
      ) : (
        <>
          <Card className="animate-fade-up overflow-hidden">
            <CardHeader
              title="Tài khoản người dùng"
              subtitle="Đổi vai trò và khoá/mở khoá tài khoản trực tiếp trong bảng dưới đây."
              actions={
                <Badge tone="blue" dot>
                  Tổng cộng {totalItems} tài khoản
                </Badge>
              }
            />

            {/* Thanh công cụ: tìm kiếm + lọc vai trò */}
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
              <div className="relative min-w-[240px] flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&>svg]:h-[18px] [&>svg]:w-[18px]">
                  {SearchIcon}
                </span>
                <label className="sr-only" htmlFor="adm-search">
                  Tìm tài khoản theo tên hoặc email
                </label>
                <Input
                  id="adm-search"
                  type="search"
                  className="pl-10"
                  placeholder="Tìm theo tên hoặc email…"
                  value={search}
                  onChange={handleSearchChange}
                />
              </div>
              <label className="sr-only" htmlFor="adm-role-filter">
                Lọc theo vai trò
              </label>
              <Select
                id="adm-role-filter"
                className="w-auto min-w-[180px]"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả vai trò</option>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <span className="text-sm text-slate-500">
                Tổng cộng <strong className="font-semibold text-slate-700">{totalItems}</strong> tài khoản
              </span>
            </div>

            <div className="overflow-x-auto">
              {loading && users.length === 0 ? (
                <div aria-label="Đang tải danh sách tài khoản">
                  <TableSkeleton rows={5} cols={5} />
                </div>
              ) : users.length === 0 ? (
                <EmptyState
                  icon={SearchIcon}
                  title="Không tìm thấy tài khoản nào"
                  description="Thử đổi từ khoá tìm kiếm hoặc bỏ bộ lọc vai trò."
                />
              ) : (
                <table className="ui-table min-w-[760px]">
                  <thead>
                    <tr>
                      <th scope="col" className="ui-th">Họ tên</th>
                      <th scope="col" className="ui-th">Email</th>
                      <th scope="col" className="ui-th">Vai trò</th>
                      <th scope="col" className="ui-th">Trạng thái</th>
                      <th scope="col" className="ui-th">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const active = u.is_active !== false;
                      const busy = busyId === u.id;
                      return (
                        <tr key={u.id} className={`ui-tr ${active ? '' : 'opacity-60'}`}>
                          <td className="ui-td">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-[13px] font-bold text-brand-700 ring-1 ring-inset ring-brand-600/15">
                                {initialsOf(u)}
                              </span>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800">{u.full_name || '—'}</div>
                                <div className="text-xs text-slate-400">
                                  {u.employee_id ? `Liên kết hồ sơ NV #${u.employee_id}` : 'Chưa liên kết hồ sơ nhân viên'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="ui-td">{u.email}</td>
                          <td className="ui-td">
                            <div className="flex min-w-[190px] flex-col items-start gap-1.5">
                              <Badge tone={roleTone(u.role)} dot>
                                {roleLabel(u.role)}
                              </Badge>
                              <label className="sr-only" htmlFor={`role-${u.id}`}>
                                Vai trò của {u.full_name || u.email}
                              </label>
                              <Select
                                id={`role-${u.id}`}
                                className="w-auto min-w-[180px]"
                                value={u.role || 'employee'}
                                disabled={busy}
                                onChange={(e) => requestRoleChange(u, e.target.value)}
                              >
                                {ROLES.map((r) => (
                                  <option key={r.value} value={r.value}>
                                    {r.label}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </td>
                          <td className="ui-td">
                            <Badge tone={active ? 'green' : 'red'} dot>
                              {active ? 'Đang hoạt động' : 'Đã khoá'}
                            </Badge>
                          </td>
                          <td className="ui-td">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              loading={busy}
                              className={
                                active
                                  ? 'border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50'
                                  : 'border-emerald-200 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50'
                              }
                              onClick={() => requestToggleActive(u)}
                            >
                              {busy ? 'Đang xử lý…' : active ? 'Khoá tài khoản' : 'Mở khoá'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {users.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
                <span className="text-sm text-slate-500">
                  Trang {page} / {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Trước
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Sau →
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Tài liệu tri thức (KB) — khu vực tải tài liệu dạng dropzone.
              Việc quản lý tài liệu KB đầy đủ nằm ở khu vực chatbot HR; hộp thả
              tệp ở đây là lối tắt giao diện trong trang quản trị. */}
          <Card className="animate-fade-up mt-6 overflow-hidden">
            <CardHeader
              title="Tài liệu tri thức (KB)"
              subtitle="Tài liệu quy chế, nội quy nội bộ để chatbot HR tra cứu và trích dẫn khi trả lời nhân viên."
            />
            <CardBody>
              <label
                htmlFor="adm-kb-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-6 py-9 text-center transition duration-200 ease-spring hover:border-brand-400 hover:bg-brand-50/50"
              >
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-500 shadow-card ring-1 ring-inset ring-slate-200">
                  {UploadIcon}
                </span>
                <span className="text-sm font-semibold text-slate-700">
                  Kéo thả tài liệu vào đây hoặc bấm để chọn tệp
                </span>
                <span className="mt-1 text-xs leading-relaxed text-slate-400">
                  Hỗ trợ tài liệu văn bản nội bộ (quy chế, nội quy, chính sách) dùng cho chatbot HR.
                </span>
              </label>
              <input
                id="adm-kb-upload"
                type="file"
                className="sr-only"
                onChange={(e) => {
                  setKbNote(
                    'Đã nhận tệp. Việc quản lý, lập chỉ mục tài liệu tri thức được thực hiện tại khu vực Chatbot HR — vui lòng hoàn tất tải lên ở đó.',
                  );
                  e.target.value = '';
                }}
              />
              {kbNote && (
                <Alert tone="info" className="mt-4">
                  {kbNote}
                </Alert>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* Hộp thoại xác nhận thao tác quản trị (thay cho window.confirm) */}
      {confirm && (
        <Modal
          open
          title={
            confirm.kind === 'role'
              ? 'Đổi vai trò tài khoản'
              : confirm.nextActive
                ? 'Mở khoá tài khoản'
                : 'Khoá tài khoản'
          }
          subtitle={
            confirm.kind === 'role'
              ? 'Thay đổi vai trò có hiệu lực ngay từ phiên đăng nhập tiếp theo của tài khoản này.'
              : undefined
          }
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
                Huỷ
              </Button>
              <Button
                type="button"
                variant={confirm.kind === 'toggle' && !confirm.nextActive ? 'danger' : 'primary'}
                onClick={executeConfirm}
              >
                {confirm.kind === 'role'
                  ? 'Đổi vai trò'
                  : confirm.nextActive
                    ? 'Mở khoá'
                    : 'Khoá tài khoản'}
              </Button>
            </>
          }
        >
          {confirm.kind === 'role' ? (
            <p className="text-sm leading-relaxed text-slate-600">
              Đổi vai trò của “{confirmName}” từ{' '}
              <strong className="font-semibold text-slate-800">{roleLabel(confirm.user.role)}</strong>{' '}
              thành{' '}
              <strong className="font-semibold text-slate-800">{roleLabel(confirm.nextRole)}</strong>?
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-slate-600">
              {confirm.nextActive
                ? `Mở khoá tài khoản "${confirmName}"? Tài khoản sẽ đăng nhập lại được ngay.`
                : `Khoá tài khoản "${confirmName}"? Tài khoản sẽ không đăng nhập được nữa cho tới khi được mở khoá. Dữ liệu nghiệp vụ liên quan vẫn được giữ nguyên.`}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
