import { useCallback, useEffect, useRef, useState } from 'react';
import { listUsers, updateUserRole, setUserActive, friendlyError } from '../services';

/**
 * Trang Quản trị tài khoản (FR-01, route /admin).
 * - Admin: xem danh sách tài khoản, đổi vai trò (role), khoá/mở khoá tài khoản.
 * - HR: chỉ xem được trong giới hạn backend trả về — mọi thao tác sửa đều do
 *   backend kiểm tra quyền lại; nếu backend từ chối (403), trang báo rõ.
 * Mọi thay đổi đều hỏi xác nhận trước và hiển thị kết quả thành công/lỗi.
 */

const ROLES = [
  { value: 'admin', label: 'Quản trị viên' },
  { value: 'hr', label: 'Nhân sự (HR)' },
  { value: 'manager', label: 'Trưởng phòng' },
  { value: 'employee', label: 'Nhân viên' },
];
const roleLabel = (value) => ROLES.find((r) => r.value === value)?.label || value || '—';

const STYLE = `
.adm-toolbar { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; margin-bottom: var(--space-4); }
.adm-search {
  flex: 1 1 260px; display: flex; align-items: center; gap: var(--space-2);
  padding: 0 var(--space-3); background: var(--color-surface);
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-md);
}
.adm-search input { flex: 1; border: none; padding: var(--space-2) 0; font-size: var(--text-sm); background: transparent; }
.adm-search input:focus { outline: none; }
.adm-search:focus-within { border-color: var(--color-primary-500); outline: 2px solid var(--color-primary-100); }
.adm-select {
  padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md); background: var(--color-surface); font-size: var(--text-sm);
}
.adm-card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden;
  animation: admFadeUp var(--duration-slow) var(--ease-out) both;
}
.adm-tablewrap { overflow-x: auto; }
.adm-table { width: 100%; border-collapse: collapse; min-width: 720px; }
.adm-table th, .adm-table td {
  padding: var(--space-3) var(--space-4); text-align: left; vertical-align: middle;
  border-bottom: 1px solid var(--color-border); font-size: var(--text-sm);
}
.adm-table th {
  background: var(--color-gray-50); color: var(--color-text-secondary);
  font-weight: var(--weight-semibold); font-size: var(--text-xs);
  text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
}
.adm-table tbody tr { transition: background var(--duration-fast) var(--ease-out); }
.adm-table tbody tr:hover { background: var(--color-gray-50); }
.adm-table tbody tr.locked { opacity: 0.62; }
.adm-user-name { font-weight: var(--weight-medium); }
.adm-role-select {
  padding: var(--space-1) var(--space-2); border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm); background: var(--color-surface); font-size: var(--text-sm);
}
.adm-role-select:disabled { opacity: 0.6; }
.adm-badge {
  display: inline-block; padding: 2px var(--space-2); border-radius: var(--radius-full);
  font-size: var(--text-xs); font-weight: var(--weight-medium); border: 1px solid transparent; white-space: nowrap;
}
.adm-badge.active { background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success-border); }
.adm-badge.locked { background: var(--color-danger-bg); color: var(--color-danger); border-color: var(--color-danger-border); }
.adm-btn {
  display: inline-flex; align-items: center; gap: var(--space-1);
  padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm);
  font-size: var(--text-sm); font-weight: var(--weight-medium);
  border: 1px solid var(--color-border-strong); background: var(--color-surface);
  color: var(--color-text); white-space: nowrap;
  transition: background var(--duration-fast), border-color var(--duration-fast), color var(--duration-fast);
}
.adm-btn:hover:not(:disabled) { background: var(--color-gray-100); }
.adm-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.adm-btn.danger { color: var(--color-danger); border-color: var(--color-danger-border); }
.adm-btn.danger:hover:not(:disabled) { background: var(--color-danger-bg); }
.adm-btn.success { color: var(--color-success); border-color: var(--color-success-border); }
.adm-btn.success:hover:not(:disabled) { background: var(--color-success-bg); }
.adm-alert {
  padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
  font-size: var(--text-sm); margin-bottom: var(--space-4); border: 1px solid transparent;
  animation: admFadeUp var(--duration-base) var(--ease-out) both;
}
.adm-alert.error { background: var(--color-danger-bg); color: var(--color-danger); border-color: var(--color-danger-border); }
.adm-alert.success { background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success-border); }
.adm-pagination {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  padding: var(--space-3) var(--space-4); background: var(--color-surface);
}
.adm-empty { text-align: center; color: var(--color-text-secondary); padding: var(--space-10) var(--space-4); }
.adm-skeleton {
  height: 52px; margin: var(--space-3) var(--space-4); border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--color-gray-100) 25%, var(--color-gray-200) 50%, var(--color-gray-100) 75%);
  background-size: 200% 100%; animation: admShimmer 1.2s infinite;
}
@keyframes admFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes admShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
`;

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
  async function handleRoleChange(user, nextRole) {
    if (nextRole === user.role) return;
    const name = user.full_name || user.email;
    if (
      !window.confirm(
        `Đổi vai trò của "${name}" từ ${roleLabel(user.role)} thành ${roleLabel(nextRole)}?\n` +
          'Vai trò mới có hiệu lực ngay từ phiên đăng nhập tiếp theo của tài khoản này.',
      )
    ) {
      return;
    }
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

  async function handleToggleActive(user) {
    const nextActive = !(user.is_active !== false);
    const name = user.full_name || user.email;
    const promptText = nextActive
      ? `Mở khoá tài khoản "${name}"? Tài khoản sẽ đăng nhập lại được ngay.`
      : `Khoá tài khoản "${name}"? Tài khoản sẽ không đăng nhập được nữa cho tới khi được mở khoá. Dữ liệu nghiệp vụ liên quan vẫn được giữ nguyên.`;
    if (!window.confirm(promptText)) return;
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

  return (
    <div>
      <style>{STYLE}</style>
      <h1 className="page-title">Quản trị tài khoản</h1>
      <p className="page-subtitle">
        Quản lý tài khoản đăng nhập hệ thống: đổi vai trò và khoá/mở khoá tài khoản. Phân quyền
        được kiểm tra ở máy chủ — quản trị viên (Admin) thao tác được toàn bộ, HR chỉ xem trong
        giới hạn được cấp.
      </p>

      <div style={{ marginTop: 'var(--space-6)' }}>
        {error && (
          <div className="adm-alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="adm-alert success" role="status">
            {notice}
          </div>
        )}

        {forbidden ? (
          <div className="adm-card">
            <div className="adm-empty">
              <p style={{ fontWeight: 'var(--weight-medium)', color: 'var(--color-text)', marginBottom: 'var(--space-2)' }}>
                Bạn không có quyền xem danh sách tài khoản
              </p>
              <p>
                Khu vực này chỉ dành cho quản trị viên (Admin). Nếu bạn cần đổi vai trò hoặc
                khoá/mở tài khoản, vui lòng liên hệ Admin của hệ thống.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="adm-toolbar">
              <div className="adm-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m20 20-3.8-3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <label className="sr-only" htmlFor="adm-search">Tìm tài khoản theo tên hoặc email</label>
                <input
                  id="adm-search"
                  type="search"
                  placeholder="Tìm theo tên hoặc email…"
                  value={search}
                  onChange={handleSearchChange}
                />
              </div>
              <label className="sr-only" htmlFor="adm-role-filter">Lọc theo vai trò</label>
              <select
                id="adm-role-filter"
                className="adm-select"
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
              </select>
              <span className="text-sm text-secondary">
                Tổng cộng <strong>{totalItems}</strong> tài khoản
              </span>
            </div>

            <div className="adm-card">
              <div className="adm-tablewrap">
                {loading && users.length === 0 ? (
                  <div aria-label="Đang tải danh sách tài khoản">
                    <div className="adm-skeleton" />
                    <div className="adm-skeleton" />
                    <div className="adm-skeleton" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="adm-empty">
                    <p style={{ fontWeight: 'var(--weight-medium)', color: 'var(--color-text)', marginBottom: 'var(--space-2)' }}>
                      Không tìm thấy tài khoản nào
                    </p>
                    <p>Thử đổi từ khoá tìm kiếm hoặc bỏ bộ lọc vai trò.</p>
                  </div>
                ) : (
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th scope="col">Họ tên</th>
                        <th scope="col">Email</th>
                        <th scope="col">Vai trò</th>
                        <th scope="col">Trạng thái</th>
                        <th scope="col">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        const active = u.is_active !== false;
                        const busy = busyId === u.id;
                        return (
                          <tr key={u.id} className={active ? undefined : 'locked'}>
                            <td>
                              <div className="adm-user-name">{u.full_name || '—'}</div>
                              <div className="text-xs text-muted">
                                {u.employee_id ? `Liên kết hồ sơ NV #${u.employee_id}` : 'Chưa liên kết hồ sơ nhân viên'}
                              </div>
                            </td>
                            <td>{u.email}</td>
                            <td>
                              <label className="sr-only" htmlFor={`role-${u.id}`}>
                                Vai trò của {u.full_name || u.email}
                              </label>
                              <select
                                id={`role-${u.id}`}
                                className="adm-role-select"
                                value={u.role || 'employee'}
                                disabled={busy}
                                onChange={(e) => handleRoleChange(u, e.target.value)}
                              >
                                {ROLES.map((r) => (
                                  <option key={r.value} value={r.value}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <span className={`adm-badge ${active ? 'active' : 'locked'}`}>
                                {active ? 'Đang hoạt động' : 'Đã khoá'}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`adm-btn ${active ? 'danger' : 'success'}`}
                                disabled={busy}
                                onClick={() => handleToggleActive(u)}
                              >
                                {busy ? 'Đang xử lý…' : active ? 'Khoá tài khoản' : 'Mở khoá'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {users.length > 0 && (
                <div className="adm-pagination">
                  <span className="text-sm text-secondary">
                    Trang {page} / {totalPages}
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="adm-btn"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ← Trước
                    </button>
                    <button
                      type="button"
                      className="adm-btn"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Sau →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
