import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getPeriods,
  createPeriod,
  calculatePeriod,
  lockPeriod,
  getPeriodItems,
  getMyPayslip,
} from '../services';

/* ================= Helpers ================= */

// Tiền tệ: số nguyên VND, format vi-VN theo contract FE
const vndFmt = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
export const formatVND = (v) => vndFmt.format(Number(v ?? 0));

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const formatDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
};

// Lấy field chịu được cả snake_case (DB/BE Flask) lẫn camelCase
const pick = (obj, ...keys) => {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
};

// axiosClient có thể trả axios response hoặc body trực tiếp (tuỳ interceptor)
const unwrap = (res) => {
  if (res && typeof res === 'object' && 'data' in res && ('status' in res || 'headers' in res)) {
    return res.data;
  }
  return res;
};

// Danh sách phân trang theo quy ước B6: { data: [...], meta: {...} }
const unwrapList = (res) => {
  const body = unwrap(res);
  if (Array.isArray(body)) return { items: body, meta: null };
  if (body && Array.isArray(body.data)) return { items: body.data, meta: body.meta || null };
  return { items: [], meta: null };
};

const errorMessage = (err, fallback) =>
  err?.response?.data?.error?.message ||
  err?.response?.data?.message ||
  err?.message ||
  fallback;

// Lấy user hiện tại: ưu tiên prop, sau đó localStorage, cuối cùng giải mã JWT (payload có role — B8)
function resolveUser(propUser) {
  if (propUser?.role) return propUser;
  try {
    for (const key of ['hrm_user', 'user', 'authUser', 'currentUser']) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.role) return u;
      }
    }
    for (const key of ['hrm_access_token', 'accessToken', 'access_token', 'token']) {
      const t = localStorage.getItem(key);
      if (t && t.split('.').length === 3) {
        const payload = JSON.parse(
          atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
        );
        if (payload?.role) return { id: payload.sub, role: payload.role };
      }
    }
  } catch {
    /* bỏ qua — coi như chưa rõ role */
  }
  return propUser || null;
}

/* ================= Styles (tự chứa — không phụ thuộc ui.jsx) ================= */

const S = {
  page: { padding: '24px', maxWidth: 1180, margin: '0 auto', fontFamily: 'inherit' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 4 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 600, margin: '0 0 12px' },
  btn: { padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  btnPrimary: { background: '#2563eb', borderColor: '#2563eb', color: '#fff' },
  btnDanger: { background: '#dc2626', borderColor: '#dc2626', color: '#fff' },
  btnSm: { padding: '5px 10px', fontSize: 12, borderRadius: 6 },
  btnDisabled: { opacity: 0.55, cursor: 'not-allowed' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' },
  thNum: { textAlign: 'right' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
  tdNum: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  badgeDraft: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e' },
  badgeLocked: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#dcfce7', color: '#166534' },
  alertErr: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 16 },
  alertOk: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 16 },
  empty: { textAlign: 'center', color: '#64748b', fontSize: 13, padding: '28px 12px' },
  pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13, color: '#475569' },
  fieldLabel: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, background: '#fff' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' },
  modalTitle: { fontSize: 16, fontWeight: 700, margin: '0 0 10px' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  warnBox: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 },
  slipRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 0', borderBottom: '1px dashed #e2e8f0', fontSize: 14 },
  slipTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0 2px', fontSize: 16, fontWeight: 700, color: '#166534' },
  rowSelected: { background: '#eff6ff' },
};

/* ================= Modal dùng chung trong trang ================= */

function Modal({ title, children, onClose, actions }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={S.modalTitle}>{title}</h3>
        {children}
        <div style={S.modalActions}>{actions}</div>
      </div>
    </div>
  );
}

/* ================= Trang chính — route /payroll ================= */

export default function PayrollPage({ user: userProp }) {
  const user = useMemo(() => resolveUser(userProp), [userProp]);
  const role = String(user?.role || '').toLowerCase();
  const isHR = role === 'hr' || role === 'admin';

  return isHR ? <HrPayrollView /> : <MyPayslipView />;
}

/* ================= Góc nhìn HR / Admin ================= */

function HrPayrollView() {
  const [periods, setPeriods] = useState([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsMeta, setItemsMeta] = useState(null);
  const [itemsPage, setItemsPage] = useState(1);
  const [loadingItems, setLoadingItems] = useState(false);
  const [busyId, setBusyId] = useState(null); // period id đang tính/chốt
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(() => {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear(), standardWorkdays: 22 };
  });
  const [creating, setCreating] = useState(false);

  const [lockTarget, setLockTarget] = useState(null); // period chờ xác nhận chốt

  const selectedPeriod = useMemo(
    () => periods.find((p) => String(p.id) === String(selectedId)) || null,
    [periods, selectedId],
  );

  const loadPeriods = useCallback(async () => {
    setLoadingPeriods(true);
    try {
      const { items: list } = unwrapList(await getPeriods({ page: 1, limit: 100 }));
      setPeriods(list);
      setSelectedId((prev) => {
        if (prev && list.some((p) => String(p.id) === String(prev))) return prev;
        return list.length ? list[0].id : null;
      });
    } catch (err) {
      setError(errorMessage(err, 'Không tải được danh sách kỳ lương.'));
    } finally {
      setLoadingPeriods(false);
    }
  }, []);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  const loadItems = useCallback(async () => {
    if (!selectedId) {
      setItems([]);
      setItemsMeta(null);
      return;
    }
    setLoadingItems(true);
    try {
      const { items: list, meta } = unwrapList(
        await getPeriodItems(selectedId, { page: itemsPage, limit: 20 }),
      );
      setItems(list);
      setItemsMeta(meta);
    } catch (err) {
      setError(errorMessage(err, 'Không tải được bảng lương của kỳ này.'));
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [selectedId, itemsPage]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const selectPeriod = (id) => {
    setError('');
    setNotice('');
    setItemsPage(1);
    setSelectedId(id);
  };

  const handleCreate = async () => {
    const month = Number(createForm.month);
    const year = Number(createForm.year);
    const standardWorkdays = Number(createForm.standardWorkdays);
    if (!month || month < 1 || month > 12) return setError('Tháng phải từ 1 đến 12.');
    if (!year || year < 2000) return setError('Năm không hợp lệ.');
    if (!standardWorkdays || standardWorkdays <= 0) return setError('Ngày công chuẩn phải lớn hơn 0.');
    setCreating(true);
    setError('');
    try {
      await createPeriod({ month, year, standardWorkdays });
      setShowCreate(false);
      setNotice(`Đã tạo kỳ lương tháng ${month}/${year}.`);
      await loadPeriods();
    } catch (err) {
      setError(errorMessage(err, 'Tạo kỳ lương thất bại (có thể kỳ này đã tồn tại).'));
    } finally {
      setCreating(false);
    }
  };

  const handleCalculate = async (period) => {
    setBusyId(period.id);
    setError('');
    setNotice('');
    try {
      await calculatePeriod(period.id);
      setNotice(
        `Đã tính lương kỳ tháng ${pick(period, 'month')}/${pick(period, 'year')}. Kiểm tra bảng bên dưới trước khi chốt.`,
      );
      if (String(selectedId) === String(period.id)) await loadItems();
    } catch (err) {
      setError(errorMessage(err, 'Tính lương thất bại.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleLock = async () => {
    if (!lockTarget) return;
    setBusyId(lockTarget.id);
    setError('');
    try {
      await lockPeriod(lockTarget.id);
      setNotice(
        `Đã chốt kỳ lương tháng ${pick(lockTarget, 'month')}/${pick(lockTarget, 'year')}. Nhân viên đã xem được phiếu lương của mình.`,
      );
      setLockTarget(null);
      await loadPeriods();
      if (String(selectedId) === String(lockTarget.id)) await loadItems();
    } catch (err) {
      setError(errorMessage(err, 'Chốt kỳ lương thất bại.'));
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = itemsMeta?.totalPages || 1;
  const pageTotal = items.reduce((sum, it) => sum + Number(pick(it, 'total_salary', 'totalSalary') || 0), 0);

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Bảng lương</h1>
          <p style={S.subtitle}>Tạo kỳ lương, tính lương từ bảng công đã tổng hợp và chốt kỳ để nhân viên xem phiếu lương.</p>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowCreate(true)}>
          + Tạo kỳ lương
        </button>
      </div>

      {error && <div style={S.alertErr}>{error}</div>}
      {notice && <div style={S.alertOk}>{notice}</div>}

      {/* Danh sách kỳ lương */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>Kỳ lương</h2>
        {loadingPeriods ? (
          <div style={S.empty}>Đang tải danh sách kỳ lương…</div>
        ) : periods.length === 0 ? (
          <div style={S.empty}>Chưa có kỳ lương nào. Bấm “Tạo kỳ lương” để bắt đầu.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Kỳ lương</th>
                  <th style={{ ...S.th, ...S.thNum }}>Ngày công chuẩn</th>
                  <th style={S.th}>Trạng thái</th>
                  <th style={S.th}>Chốt lúc</th>
                  <th style={{ ...S.th, ...S.thNum }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const locked = pick(p, 'status') === 'locked';
                  const busy = String(busyId) === String(p.id);
                  return (
                    <tr key={p.id} style={String(selectedId) === String(p.id) ? S.rowSelected : undefined}>
                      <td style={S.td}>
                        <strong>
                          Tháng {pick(p, 'month')}/{pick(p, 'year')}
                        </strong>
                      </td>
                      <td style={{ ...S.td, ...S.tdNum }}>{pick(p, 'standard_workdays', 'standardWorkdays') ?? '—'}</td>
                      <td style={S.td}>
                        {locked ? (
                          <span style={S.badgeLocked}>Đã chốt</span>
                        ) : (
                          <span style={S.badgeDraft}>Nháp</span>
                        )}
                      </td>
                      <td style={S.td}>{formatDateTime(pick(p, 'locked_at', 'lockedAt'))}</td>
                      <td style={{ ...S.td, ...S.tdNum }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button style={{ ...S.btn, ...S.btnSm }} onClick={() => selectPeriod(p.id)}>
                            Xem bảng lương
                          </button>
                          {!locked && (
                            <>
                              <button
                                style={{ ...S.btn, ...S.btnSm, ...(busy ? S.btnDisabled : {}) }}
                                disabled={busy}
                                onClick={() => handleCalculate(p)}
                              >
                                {busy ? 'Đang xử lý…' : 'Tính lương'}
                              </button>
                              <button
                                style={{ ...S.btn, ...S.btnSm, ...S.btnDanger, ...(busy ? S.btnDisabled : {}) }}
                                disabled={busy}
                                onClick={() => setLockTarget(p)}
                              >
                                Chốt kỳ
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bảng lương chi tiết của kỳ đang chọn */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>
          {selectedPeriod
            ? `Bảng lương tháng ${pick(selectedPeriod, 'month')}/${pick(selectedPeriod, 'year')}` +
              (pick(selectedPeriod, 'status') === 'locked' ? ' — đã chốt' : ' — xem trước (bản nháp)')
            : 'Bảng lương chi tiết'}
        </h2>
        {!selectedPeriod ? (
          <div style={S.empty}>Chọn một kỳ lương để xem chi tiết.</div>
        ) : loadingItems ? (
          <div style={S.empty}>Đang tải bảng lương…</div>
        ) : items.length === 0 ? (
          <div style={S.empty}>
            Kỳ này chưa có dữ liệu lương. Bấm “Tính lương” ở kỳ tương ứng để hệ thống tính từ bảng công và đơn nghỉ đã duyệt.
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Mã NV</th>
                    <th style={S.th}>Nhân viên</th>
                    <th style={S.th}>Phòng ban</th>
                    <th style={{ ...S.th, ...S.thNum }}>Ngày công hưởng lương</th>
                    <th style={{ ...S.th, ...S.thNum }}>Lương cơ bản</th>
                    <th style={{ ...S.th, ...S.thNum }}>Phụ cấp</th>
                    <th style={{ ...S.th, ...S.thNum }}>Khấu trừ bảo hiểm</th>
                    <th style={{ ...S.th, ...S.thNum }}>Khấu trừ khác</th>
                    <th style={{ ...S.th, ...S.thNum }}>Tổng nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const emp = it.employee || {};
                    return (
                      <tr key={it.id}>
                        <td style={S.td}>{pick(it, 'employee_code', 'employeeCode') || pick(emp, 'code') || '—'}</td>
                        <td style={S.td}>{pick(it, 'employee_name', 'employeeName') || pick(emp, 'full_name', 'fullName') || '—'}</td>
                        <td style={S.td}>
                          {pick(it, 'department_name', 'departmentName') || pick(emp, 'department_name', 'departmentName') || pick(emp.department || {}, 'name') || '—'}
                        </td>
                        <td style={{ ...S.td, ...S.tdNum }}>{pick(it, 'workdays_paid', 'workdaysPaid') ?? '—'}</td>
                        <td style={{ ...S.td, ...S.tdNum }}>{formatVND(pick(it, 'base_salary', 'baseSalary'))}</td>
                        <td style={{ ...S.td, ...S.tdNum }}>{formatVND(pick(it, 'allowance'))}</td>
                        <td style={{ ...S.td, ...S.tdNum }}>{formatVND(pick(it, 'insurance_deduction', 'insuranceDeduction'))}</td>
                        <td style={{ ...S.td, ...S.tdNum }}>{formatVND(pick(it, 'other_deduction', 'otherDeduction'))}</td>
                        <td style={{ ...S.td, ...S.tdNum, fontWeight: 700 }}>{formatVND(pick(it, 'total_salary', 'totalSalary'))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={S.pagination}>
              <span>
                Tổng chi trang này: <strong>{formatVND(pageTotal)}</strong>
                {itemsMeta?.totalItems ? ` · ${itemsMeta.totalItems} nhân viên trong kỳ` : ''}
              </span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  style={{ ...S.btn, ...S.btnSm, ...(itemsPage <= 1 ? S.btnDisabled : {}) }}
                  disabled={itemsPage <= 1}
                  onClick={() => setItemsPage((p) => Math.max(1, p - 1))}
                >
                  ← Trước
                </button>
                <span>
                  Trang {itemsPage}/{totalPages}
                </span>
                <button
                  style={{ ...S.btn, ...S.btnSm, ...(itemsPage >= totalPages ? S.btnDisabled : {}) }}
                  disabled={itemsPage >= totalPages}
                  onClick={() => setItemsPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sau →
                </button>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Modal tạo kỳ lương */}
      {showCreate && (
        <Modal
          title="Tạo kỳ lương"
          onClose={() => setShowCreate(false)}
          actions={
            <>
              <button style={S.btn} onClick={() => setShowCreate(false)}>
                Huỷ
              </button>
              <button
                style={{ ...S.btn, ...S.btnPrimary, ...(creating ? S.btnDisabled : {}) }}
                disabled={creating}
                onClick={handleCreate}
              >
                {creating ? 'Đang tạo…' : 'Tạo kỳ'}
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={S.fieldLabel}>Tháng</label>
              <input
                style={S.input}
                type="number"
                min="1"
                max="12"
                value={createForm.month}
                onChange={(e) => setCreateForm((f) => ({ ...f, month: e.target.value }))}
              />
            </div>
            <div>
              <label style={S.fieldLabel}>Năm</label>
              <input
                style={S.input}
                type="number"
                min="2000"
                value={createForm.year}
                onChange={(e) => setCreateForm((f) => ({ ...f, year: e.target.value }))}
              />
            </div>
            <div>
              <label style={S.fieldLabel}>Ngày công chuẩn của tháng</label>
              <input
                style={S.input}
                type="number"
                min="1"
                step="0.5"
                value={createForm.standardWorkdays}
                onChange={(e) => setCreateForm((f) => ({ ...f, standardWorkdays: e.target.value }))}
              />
              <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 0' }}>
                Mặc định là số ngày làm việc thứ 2–thứ 6 trong tháng. Lương được tính theo tỷ lệ
                ngày công hưởng lương / ngày công chuẩn.
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal xác nhận chốt kỳ — cảnh báo không sửa được */}
      {lockTarget && (
        <Modal
          title="Chốt kỳ lương?"
          onClose={() => setLockTarget(null)}
          actions={
            <>
              <button style={S.btn} onClick={() => setLockTarget(null)}>
                Huỷ
              </button>
              <button
                style={{ ...S.btn, ...S.btnDanger, ...(busyId ? S.btnDisabled : {}) }}
                disabled={!!busyId}
                onClick={handleLock}
              >
                {busyId ? 'Đang chốt…' : 'Chốt kỳ lương'}
              </button>
            </>
          }
        >
          <div style={S.warnBox}>
            ⚠️ Sau khi chốt kỳ lương tháng {pick(lockTarget, 'month')}/{pick(lockTarget, 'year')},{' '}
            <strong>bảng lương sẽ bị khoá và không thể sửa hay tính lại trực tiếp</strong>. Nhân viên
            sẽ xem được phiếu lương của mình ngay sau khi chốt.
            <br />
            <br />
            Hãy chắc chắn đã bấm “Tính lương” và kiểm tra kỹ bảng lương xem trước. Muốn thay đổi sau
            khi chốt phải có thao tác mở khoá của Admin/HR kèm lý do và được ghi nhật ký.
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= Góc nhìn Employee (và các role không phải HR/Admin) ================= */

function MyPayslipView() {
  const [lockedPeriods, setLockedPeriods] = useState([]);
  const [periodId, setPeriodId] = useState('');
  const [slip, setSlip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // Tải danh sách kỳ đã chốt để chọn; nếu API kỳ lương bị giới hạn quyền thì
  // vẫn xem được phiếu của kỳ đã chốt mới nhất qua /payroll/my-payslip.
  useEffect(() => {
    (async () => {
      try {
        const { items } = unwrapList(await getPeriods({ page: 1, limit: 100 }));
        const locked = items.filter((p) => pick(p, 'status') === 'locked');
        setLockedPeriods(locked);
        if (locked.length) setPeriodId(String(locked[0].id));
        else setLoading(false);
      } catch {
        setLockedPeriods([]);
        setPeriodId('');
        setLoading(false);
      }
    })();
  }, []);

  const loadSlip = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const body = unwrap(await getMyPayslip(periodId || undefined));
      const slipData = body?.data ?? body;
      setSlip(slipData && typeof slipData === 'object' ? slipData : null);
      if (!slipData) setNotFound(true);
    } catch (err) {
      if (err?.response?.status === 404) {
        setSlip(null);
        setNotFound(true);
      } else {
        setError(errorMessage(err, 'Không tải được phiếu lương.'));
      }
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    // Chỉ gọi khi đã biết danh sách kỳ đã chốt (hoặc chắc chắn không lấy được danh sách)
    if (lockedPeriods.length > 0 && !periodId) return;
    loadSlip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const breakdown = slip?.breakdown || {};
  const baseSalary = pick(slip, 'base_salary', 'baseSalary');
  const workdaysPaid = pick(slip, 'workdays_paid', 'workdaysPaid');
  const standardWorkdays =
    pick(breakdown, 'standard_workdays', 'standardWorkdays') ??
    pick(slip, 'standard_workdays', 'standardWorkdays');
  const salaryByWorkdays = pick(breakdown, 'salary_by_workdays', 'salaryByWorkdays');
  const allowance = pick(slip, 'allowance');
  const insuranceDeduction = pick(slip, 'insurance_deduction', 'insuranceDeduction');
  const insuranceRate = pick(breakdown, 'insurance_rate', 'insuranceRate');
  const otherDeduction = pick(slip, 'other_deduction', 'otherDeduction');
  const totalSalary = pick(slip, 'total_salary', 'totalSalary');
  const emp = slip?.employee || {};
  const period = slip?.period || {};
  const periodLabel =
    pick(period, 'month') && pick(period, 'year')
      ? `tháng ${pick(period, 'month')}/${pick(period, 'year')}`
      : lockedPeriods.find((p) => String(p.id) === String(periodId))
        ? (() => {
            const p = lockedPeriods.find((x) => String(x.id) === String(periodId));
            return `tháng ${pick(p, 'month')}/${pick(p, 'year')}`;
          })()
        : '';

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Phiếu lương của tôi</h1>
          <p style={S.subtitle}>Phiếu lương chỉ hiển thị sau khi HR đã chốt kỳ lương.</p>
        </div>
        {lockedPeriods.length > 1 && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            Kỳ lương:
            <select
              style={S.select}
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              {lockedPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  Tháng {pick(p, 'month')}/{pick(p, 'year')}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <div style={S.alertErr}>{error}</div>}

      {loading ? (
        <div style={S.card}>
          <div style={S.empty}>Đang tải phiếu lương…</div>
        </div>
      ) : notFound || !slip ? (
        <div style={S.card}>
          <div style={S.empty}>
            Chưa có phiếu lương {periodLabel ? `cho ${periodLabel}` : ''}. Kỳ lương có thể chưa
            được HR chốt — vui lòng kiểm tra lại sau hoặc liên hệ phòng nhân sự.
          </div>
        </div>
      ) : (
        <div style={{ ...S.card, maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ ...S.cardTitle, textAlign: 'center', fontSize: 17 }}>
            PHIẾU LƯƠNG {periodLabel ? periodLabel.toUpperCase() : ''}
          </h2>
          {(pick(emp, 'full_name', 'fullName') || pick(slip, 'employee_name', 'employeeName')) && (
            <p style={{ textAlign: 'center', color: '#475569', fontSize: 13, margin: '0 0 14px' }}>
              {pick(slip, 'employee_name', 'employeeName') || pick(emp, 'full_name', 'fullName')}
              {pick(emp, 'code') || pick(slip, 'employee_code', 'employeeCode')
                ? ` · Mã NV: ${pick(slip, 'employee_code', 'employeeCode') || pick(emp, 'code')}`
                : ''}
            </p>
          )}

          <div style={S.slipRow}>
            <span>Lương cơ bản (theo hợp đồng)</span>
            <strong>{formatVND(baseSalary)}</strong>
          </div>
          <div style={S.slipRow}>
            <span>
              Ngày công hưởng lương
              {standardWorkdays ? ` / ngày công chuẩn` : ''}
            </span>
            <strong>
              {workdaysPaid ?? '—'}
              {standardWorkdays ? ` / ${standardWorkdays} ngày` : ' ngày'}
            </strong>
          </div>
          {salaryByWorkdays !== undefined && (
            <div style={S.slipRow}>
              <span>Lương theo ngày công</span>
              <strong>{formatVND(salaryByWorkdays)}</strong>
            </div>
          )}
          <div style={S.slipRow}>
            <span>Phụ cấp</span>
            <strong style={{ color: '#166534' }}>+ {formatVND(allowance)}</strong>
          </div>
          <div style={S.slipRow}>
            <span>
              Khấu trừ bảo hiểm (BHXH/BHYT/BHTN)
              {insuranceRate ? ` — tỷ lệ ${insuranceRate}% trên lương cơ bản` : ''}
            </span>
            <strong style={{ color: '#b91c1c' }}>− {formatVND(insuranceDeduction)}</strong>
          </div>
          {Number(otherDeduction || 0) > 0 && (
            <div style={S.slipRow}>
              <span>Khấu trừ khác</span>
              <strong style={{ color: '#b91c1c' }}>− {formatVND(otherDeduction)}</strong>
            </div>
          )}
          <div style={S.slipTotal}>
            <span>TỔNG THỰC NHẬN</span>
            <span>{formatVND(totalSalary)}</span>
          </div>

          <p style={{ fontSize: 12, color: '#64748b', marginTop: 14, lineHeight: 1.5 }}>
            Ghi chú: lương được tính từ bảng công và các đơn nghỉ đã duyệt trong kỳ theo công thức:
            lương cơ bản × (ngày công hưởng lương / ngày công chuẩn) + phụ cấp − khấu trừ bảo hiểm −
            khấu trừ khác. Đây là mô hình tính lương đơn giản hoá; nếu thấy sai lệch, vui lòng liên
            hệ phòng nhân sự để đối chiếu.
          </p>
        </div>
      )}
    </div>
  );
}
