import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/AuthContext.jsx';
import {
  approveObjective, checkInKeyResult, createCycle, createObjective, createReview,
  deleteObjective, getCheckins, getCycles, getDashboard, getEmployees,
  getObjectives, getReviews, getSuggestions, returnObjective, submitObjective,
  updateCycleStatus, updateObjective,
} from '../services';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState,
  FormField, Input, Modal, PageHeader, Select, Skeleton, StatCard, Textarea,
} from '../../../components/ui';
import ProgressRing from '../../../components/motion/ProgressRing.jsx';
import { StaggerList, StaggerItem } from '../../../components/motion';

/* ---------- Helpers ---------- */

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('hrm_user') || localStorage.getItem('user') || localStorage.getItem('currentUser');
    if (raw) {
      const u = JSON.parse(raw);
      return { ...u, employeeId: u.employeeId ?? u.employee_id ?? null };
    }
  } catch { /* ignore */ }
  try {
    const token = localStorage.getItem('hrm_access_token') || localStorage.getItem('access_token') || localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return { id: payload.sub, role: payload.role, employeeId: payload.employee_id ?? null };
    }
  } catch { /* ignore */ }
  return null;
}

const errMsg = (e) => e?.response?.data?.error?.message || e?.message || 'Đã xảy ra lỗi, vui lòng thử lại.';
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN') : '—');
const fmtNum = (v) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 }));

const OBJ_STATUS = {
  draft: { label: 'Nháp', tone: 'slate' },
  pending: { label: 'Chờ duyệt', tone: 'amber' },
  active: { label: 'Đang hiệu lực', tone: 'green' },
  completed: { label: 'Đã hoàn thành', tone: 'blue' },
  cancelled: { label: 'Đã huỷ', tone: 'slate' },
};

const CYCLE_STATUS = {
  draft: { label: 'Nháp', tone: 'slate' },
  active: { label: 'Đang diễn ra', tone: 'green' },
  in_review: { label: 'Đang đánh giá', tone: 'amber' },
  closed: { label: 'Đã đóng', tone: 'slate' },
};

// Chuyển trạng thái chu kỳ kế tiếp mà HR/Admin được bấm (khớp máy trạng thái BE).
const CYCLE_NEXT = {
  draft: [{ to: 'active', label: 'Kích hoạt chu kỳ' }],
  active: [{ to: 'in_review', label: 'Mở đánh giá cuối kỳ' }, { to: 'closed', label: 'Đóng chu kỳ' }],
  in_review: [{ to: 'closed', label: 'Đóng chu kỳ' }],
  closed: [],
};

const RATING_TONE = {
  'Xuất sắc': 'green',
  'Tốt': 'blue',
  'Đạt': 'teal',
  'Cần cải thiện': 'amber',
  'Không đạt': 'red',
};

function ratingTone(rating) {
  return RATING_TONE[rating] || 'slate';
}

// Xếp loại phía FE chỉ để hiển thị khi BE chưa trả rating (khớp thang 4.1).
function ratingFor(score) {
  if (score === null || score === undefined) return null;
  if (score >= 90) return 'Xuất sắc';
  if (score >= 75) return 'Tốt';
  if (score >= 60) return 'Đạt';
  if (score >= 40) return 'Cần cải thiện';
  return 'Không đạt';
}

/* ---------- Thẻ mục tiêu ---------- */

function ObjectiveCard({ obj, isMine, onCheckin, onEdit, onSubmit, onDelete }) {
  const meta = OBJ_STATUS[obj.status] || { label: obj.status, tone: 'slate' };
  const score = obj.score ?? obj.progress_percent ?? 0;
  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-4">
          <ProgressRing
            value={score}
            size={76}
            stroke={7}
            color="#274FEA"
            track="#EAECF0"
            label={`${Math.round(score)}%`}
            sub="tiến độ"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-gray-900">{obj.title}</h3>
              <Badge tone={meta.tone} dot>{meta.label}</Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {obj.employee_name ? `Chủ mục tiêu: ${obj.employee_name}` : `Phòng ban: ${obj.department_name || '—'}`}
              {obj.weight ? ` · Trọng số ${fmtNum(obj.weight)}` : ''}
            </p>
            {obj.description && <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{obj.description}</p>}
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          {(obj.key_results || []).map((kr) => {
            const pct = kr.progress_percent ?? 0;
            return (
              <div key={kr.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-gray-800">{kr.title}</p>
                    <p className="text-[13px] tabular-nums text-gray-500">
                      <span className="font-semibold text-gray-900">{fmtNum(kr.current_value)}</span>
                      {' / '}{fmtNum(kr.target_value)}{kr.unit ? ` ${kr.unit}` : ''}
                      {kr.direction === 'decrease' && <span className="ml-1 text-gray-400">(càng thấp càng tốt)</span>}
                    </p>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                  </div>
                </div>
                {isMine && obj.status === 'active' && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => onCheckin(kr, obj)}>
                    Check-in
                  </Button>
                )}
              </div>
            );
          })}
          {(obj.key_results || []).length === 0 && (
            <p className="text-sm text-gray-400">Chưa có Key Result nào.</p>
          )}
        </div>

        {isMine && obj.status === 'draft' && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            <Button type="button" size="sm" onClick={() => onSubmit(obj)}>Gửi duyệt</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => onEdit(obj)}>Sửa</Button>
            <Button type="button" variant="ghost" size="sm" className="text-[#B42318] hover:bg-[#FEF3F2]" onClick={() => onDelete(obj)}>
              Huỷ mục tiêu
            </Button>
          </div>
        )}
        {isMine && obj.status === 'pending' && (
          <p className="mt-4 border-t border-gray-100 pt-3 text-[13px] text-gray-500">
            Đang chờ quản lý duyệt — bạn sẽ nhận thông báo khi có kết quả.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/* ---------- Trang chính ---------- */

export default function PerformancePage() {
  // Nguồn chuẩn là useAuth(); getCurrentUser (localStorage) chỉ là dự phòng
  // khi context chưa nạp xong — cả hai đều cho cùng tín hiệu employeeId.
  const { user: authUser } = useAuth();
  const localUser = useMemo(getCurrentUser, []);
  const user = authUser || localUser;
  const role = user?.role || '';
  const myId = user?.employeeId ?? null;
  // Tín hiệu có hồ sơ nhân viên gắn với tài khoản (admin hệ thống có thể null).
  const hasProfile = Boolean(myId);
  const isHR = ['hr', 'admin'].includes(role);
  const canTeam = ['hr', 'admin', 'manager'].includes(role);
  // Backend performance: HR/Admin không gắn hồ sơ vẫn dùng được toàn cục;
  // employee/manager không hồ sơ bị chặn ở mọi endpoint dữ liệu (400
  // NO_EMPLOYEE_PROFILE) nên không gọi các API đó để tránh banner lỗi đỏ.
  const canLoadData = isHR || hasProfile;

  const [tab, setTab] = useState(() => (hasProfile ? 'mine' : canTeam ? 'team' : 'review'));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  /* --- Chu kỳ --- */
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState(null);
  const cycle = useMemo(() => cycles.find((c) => c.id === cycleId) || null, [cycles, cycleId]);

  const loadCycles = useCallback(async (keepSelection = true) => {
    const list = await getCycles();
    setCycles(list);
    setCycleId((prev) => {
      if (keepSelection && prev && list.some((c) => c.id === prev)) return prev;
      const preferred = list.find((c) => c.status === 'active') || list.find((c) => c.status === 'in_review') || list[0];
      return preferred ? preferred.id : null;
    });
    return list;
  }, []);

  useEffect(() => {
    loadCycles(false).catch((e) => setError(errMsg(e)));
  }, [loadCycles]);

  /* --- Dữ liệu theo chu kỳ --- */
  const [objectives, setObjectives] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  const loadData = useCallback(async () => {
    if (!cycleId || !canLoadData) {
      setObjectives([]);
      setDashboard(null);
      setReviews([]);
      return;
    }
    setLoadingData(true);
    try {
      const [objs, dash, revs] = await Promise.all([
        getObjectives({ cycle_id: cycleId }),
        getDashboard(cycleId).catch(() => null),
        getReviews({ cycle_id: cycleId }).catch(() => []),
      ]);
      setObjectives(objs);
      setDashboard(dash);
      setReviews(revs);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingData(false);
    }
  }, [cycleId, canLoadData]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (canTeam) getEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, [canTeam]);

  const mineObjectives = useMemo(
    () => objectives.filter((o) => o.employee_id !== null && myId !== null && o.employee_id === myId),
    [objectives, myId],
  );
  const deptObjectives = useMemo(
    () => objectives.filter((o) => o.employee_id === null),
    [objectives],
  );
  const pendingObjectives = useMemo(
    () => objectives.filter((o) => o.status === 'pending'),
    [objectives],
  );

  const flash = (msg) => { setNotice(msg); setError(''); };
  const fail = (e) => { setError(errMsg(e)); setNotice(''); };

  /* --- Hành động chu kỳ --- */
  const [cycleModal, setCycleModal] = useState(false);
  const [cycleForm, setCycleForm] = useState({ name: '', start_date: '', end_date: '' });
  const [savingCycle, setSavingCycle] = useState(false);

  async function handleCreateCycle() {
    if (!cycleForm.name.trim() || !cycleForm.start_date || !cycleForm.end_date) {
      setError('Vui lòng nhập đủ tên chu kỳ, ngày bắt đầu và ngày kết thúc.');
      return;
    }
    setSavingCycle(true);
    try {
      const created = await createCycle(cycleForm);
      setCycleModal(false);
      setCycleForm({ name: '', start_date: '', end_date: '' });
      await loadCycles();
      if (created?.id) setCycleId(created.id);
      flash(`Đã tạo chu kỳ “${created?.name || cycleForm.name}” ở trạng thái nháp.`);
    } catch (e) { fail(e); } finally { setSavingCycle(false); }
  }

  async function handleCycleStatus(to) {
    try {
      await updateCycleStatus(cycleId, to);
      await loadCycles();
      await loadData();
      flash('Đã cập nhật trạng thái chu kỳ.');
    } catch (e) { fail(e); }
  }

  /* --- Mục tiêu: tạo / sửa --- */
  const emptyKR = () => ({ title: '', unit: '', target_value: '', current_value: '', weight: 1, direction: 'increase' });
  const [objModal, setObjModal] = useState({ open: false, editing: null });
  const [objForm, setObjForm] = useState({ title: '', description: '', weight: 1, employee_id: 'me', key_results: [emptyKR()] });
  const [suggestions, setSuggestions] = useState([]);
  const [savingObj, setSavingObj] = useState(false);

  function openCreateObjective() {
    // Không có hồ sơ thì không có lựa chọn "chính tôi": HR/Admin/Manager
    // phải chọn nhân viên nhận mục tiêu.
    setObjForm({ title: '', description: '', weight: 1, employee_id: hasProfile ? 'me' : '', key_results: [emptyKR()] });
    setObjModal({ open: true, editing: null });
    getSuggestions().then((r) => setSuggestions(r?.suggestions || [])).catch(() => setSuggestions([]));
  }

  function openEditObjective(obj) {
    setObjForm({
      title: obj.title || '',
      description: obj.description || '',
      weight: obj.weight ?? 1,
      employee_id: 'me',
      key_results: (obj.key_results || []).map((kr) => ({
        title: kr.title || '',
        unit: kr.unit || '',
        target_value: kr.target_value ?? '',
        current_value: kr.current_value ?? '',
        weight: kr.weight ?? 1,
        direction: kr.direction || 'increase',
      })),
    });
    setObjModal({ open: true, editing: obj });
    setSuggestions([]);
  }

  function applySuggestion(s) {
    setObjForm((f) => ({
      ...f,
      title: s.title || f.title,
      description: s.description || f.description,
      key_results: (s.key_results || []).map((kr) => ({
        title: kr.title || '',
        unit: kr.unit || '',
        target_value: kr.target_value ?? '',
        current_value: '',
        weight: kr.weight ?? 1,
        direction: kr.direction || 'increase',
      })),
    }));
    flash(`Đã áp dụng gợi ý mẫu “${s.title}” — hãy chỉnh lại số liệu cho đúng thực tế.`);
  }

  function setKR(index, patch) {
    setObjForm((f) => ({
      ...f,
      key_results: f.key_results.map((kr, i) => (i === index ? { ...kr, ...patch } : kr)),
    }));
  }

  async function handleSaveObjective() {
    const krs = objForm.key_results.filter((kr) => kr.title.trim());
    if (!objForm.title.trim()) { setError('Vui lòng nhập tên mục tiêu.'); return; }
    if (!objModal.editing && !hasProfile && !(canTeam && objForm.employee_id)) {
      setError('Vui lòng chọn nhân viên để tạo mục tiêu.');
      return;
    }
    if (krs.length < 1 || krs.length > 5) { setError('Mỗi mục tiêu cần có từ 1 đến 5 Key Result có tiêu đề.'); return; }
    if (krs.some((kr) => kr.target_value === '' || Number.isNaN(Number(kr.target_value)))) {
      setError('Key Result cần có giá trị mục tiêu (target) dạng số.');
      return;
    }
    const payloadKR = krs.map((kr) => ({
      title: kr.title.trim(),
      unit: kr.unit.trim() || undefined,
      target_value: Number(kr.target_value),
      current_value: kr.current_value === '' ? 0 : Number(kr.current_value),
      weight: Number(kr.weight) || 1,
      direction: kr.direction,
    }));
    setSavingObj(true);
    try {
      if (objModal.editing) {
        await updateObjective(objModal.editing.id, {
          title: objForm.title.trim(),
          description: objForm.description.trim() || undefined,
          weight: Number(objForm.weight) || 1,
          key_results: payloadKR,
        });
        flash('Đã cập nhật mục tiêu.');
      } else {
        const payload = {
          cycle_id: cycleId,
          title: objForm.title.trim(),
          description: objForm.description.trim() || undefined,
          weight: Number(objForm.weight) || 1,
          key_results: payloadKR,
        };
        if (canTeam && objForm.employee_id !== 'me') payload.employee_id = Number(objForm.employee_id);
        else if (myId) payload.employee_id = myId;
        await createObjective(payload);
        flash('Đã tạo mục tiêu ở trạng thái nháp — hãy bấm “Gửi duyệt” khi sẵn sàng.');
      }
      setObjModal({ open: false, editing: null });
      await loadData();
    } catch (e) { fail(e); } finally { setSavingObj(false); }
  }

  async function handleSubmitObjective(obj) {
    try { await submitObjective(obj.id); await loadData(); flash(`Đã gửi duyệt mục tiêu “${obj.title}”.`); }
    catch (e) { fail(e); }
  }

  async function handleDeleteObjective(obj) {
    try { await deleteObjective(obj.id); await loadData(); flash(`Đã huỷ mục tiêu “${obj.title}”.`); }
    catch (e) { fail(e); }
  }

  /* --- Check-in --- */
  const [checkinModal, setCheckinModal] = useState({ open: false, kr: null, obj: null });
  const [checkinForm, setCheckinForm] = useState({ new_value: '', note: '' });
  const [checkinHistory, setCheckinHistory] = useState([]);
  const [savingCheckin, setSavingCheckin] = useState(false);

  function openCheckin(kr, obj) {
    setCheckinModal({ open: true, kr, obj });
    setCheckinForm({ new_value: kr.current_value ?? '', note: '' });
    setCheckinHistory([]);
    getCheckins(kr.id).then(setCheckinHistory).catch(() => setCheckinHistory([]));
  }

  async function handleCheckin() {
    if (checkinForm.new_value === '' || Number.isNaN(Number(checkinForm.new_value))) {
      setError('Vui lòng nhập giá trị hiện tại mới dạng số.');
      return;
    }
    setSavingCheckin(true);
    try {
      const res = await checkInKeyResult(checkinModal.kr.id, {
        new_value: Number(checkinForm.new_value),
        note: checkinForm.note.trim() || undefined,
      });
      setCheckinModal({ open: false, kr: null, obj: null });
      await loadData();
      flash(`Đã check-in. Điểm mục tiêu hiện tại: ${res?.objective_score ?? '—'} điểm.`);
    } catch (e) { fail(e); } finally { setSavingCheckin(false); }
  }

  /* --- Duyệt / trả lại (tab Team) --- */
  const [returnModal, setReturnModal] = useState({ open: false, obj: null });
  const [returnNote, setReturnNote] = useState('');

  async function handleApprove(obj) {
    try { await approveObjective(obj.id); await loadData(); flash(`Đã duyệt mục tiêu “${obj.title}”.`); }
    catch (e) { fail(e); }
  }

  async function handleReturn() {
    try {
      await returnObjective(returnModal.obj.id, returnNote);
      setReturnModal({ open: false, obj: null });
      setReturnNote('');
      await loadData();
      flash('Đã trả lại mục tiêu để chỉnh sửa.');
    } catch (e) { fail(e); }
  }

  /* --- Đánh giá --- */
  const [selfForm, setSelfForm] = useState({ score: '', comment: '' });
  const [mgrForm, setMgrForm] = useState({ employee_id: '', score: '', comment: '' });
  const [savingReview, setSavingReview] = useState(false);

  const mySelfReview = useMemo(
    () => reviews.find((r) => r.review_type === 'self' && r.employee_id === myId) || null,
    [reviews, myId],
  );
  const reviewsAboutMe = useMemo(
    () => reviews.filter((r) => r.employee_id === myId),
    [reviews, myId],
  );
  const managerReviews = useMemo(
    () => reviews.filter((r) => r.review_type === 'manager'),
    [reviews],
  );

  useEffect(() => {
    if (mySelfReview) {
      setSelfForm({ score: mySelfReview.score ?? '', comment: mySelfReview.comment || '' });
    }
  }, [mySelfReview]);

  const systemScoreFor = useCallback((employeeId) => {
    const row = dashboard?.employees?.find((e) => e.employee_id === employeeId);
    if (row) return row.score;
    const objs = objectives.filter((o) => o.employee_id === employeeId && o.status !== 'cancelled');
    if (!objs.length) return null;
    return Math.round((objs.reduce((s, o) => s + (o.score || 0), 0) / objs.length) * 100) / 100;
  }, [dashboard, objectives]);

  // Danh sách nhân viên có thể chấm điểm: ưu tiên dữ liệu dashboard,
  // fallback theo chủ mục tiêu trong chu kỳ.
  const reviewTargets = useMemo(() => {
    const map = new Map();
    (dashboard?.employees || []).forEach((e) => map.set(e.employee_id, { id: e.employee_id, name: e.employee_name }));
    objectives.forEach((o) => {
      if (o.employee_id && !map.has(o.employee_id)) map.set(o.employee_id, { id: o.employee_id, name: o.employee_name });
    });
    return [...map.values()].filter((t) => t.id !== myId);
  }, [dashboard, objectives, myId]);

  const targetSelfReview = useMemo(
    () => reviews.find((r) => r.review_type === 'self' && r.employee_id === Number(mgrForm.employee_id)) || null,
    [reviews, mgrForm.employee_id],
  );

  async function handleSelfReview() {
    if (selfForm.score === '' || Number.isNaN(Number(selfForm.score))) { setError('Vui lòng nhập điểm tự đánh giá (0–100).'); return; }
    setSavingReview(true);
    try {
      await createReview({ cycle_id: cycleId, review_type: 'self', score: Number(selfForm.score), comment: selfForm.comment.trim() || undefined });
      await loadData();
      flash('Đã nộp tự đánh giá.');
    } catch (e) { fail(e); } finally { setSavingReview(false); }
  }

  async function handleManagerReview() {
    if (!mgrForm.employee_id) { setError('Vui lòng chọn nhân viên để chấm điểm.'); return; }
    if (mgrForm.score === '' || Number.isNaN(Number(mgrForm.score))) { setError('Vui lòng nhập điểm chốt (0–100).'); return; }
    setSavingReview(true);
    try {
      await createReview({
        cycle_id: cycleId,
        review_type: 'manager',
        employee_id: Number(mgrForm.employee_id),
        score: Number(mgrForm.score),
        comment: mgrForm.comment.trim() || undefined,
      });
      await loadData();
      flash('Đã chấm điểm chốt — các mục tiêu đang hiệu lực của nhân viên đã chuyển sang hoàn thành.');
    } catch (e) { fail(e); } finally { setSavingReview(false); }
  }

  /* --- Render --- */
  // Tab "Mục tiêu của tôi" chỉ tồn tại khi có hồ sơ; tab "Đánh giá" chỉ
  // tồn tại khi còn ít nhất 1 thẻ thuộc role (tự đánh giá của tôi khi có
  // hồ sơ, hoặc chấm điểm nhân viên cho HR/Admin/Manager).
  const tabs = [
    ...(hasProfile ? [{ key: 'mine', label: 'Mục tiêu của tôi' }] : []),
    ...(canTeam ? [{ key: 'team', label: 'Team' }] : []),
    ...((hasProfile || canTeam) ? [{ key: 'review', label: 'Đánh giá' }] : []),
  ];

  // Nếu tab đang chọn bị ẩn (vd tài khoản không hồ sơ), rơi về tab hợp lệ đầu tiên.
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.key === tab)) {
      setTab(tabs[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile, canTeam, tab]);

  return (
    <div className="page-shell">
      <PageHeader
        title="Hiệu suất — KPI/OKR"
        subtitle="Đặt mục tiêu theo chu kỳ, check-in tiến độ Key Result và đánh giá cuối kỳ."
        actions={
          <>
            {isHR && (
              <Button type="button" variant="secondary" onClick={() => setCycleModal(true)}>
                Tạo chu kỳ
              </Button>
            )}
            {(hasProfile || canTeam) && (
              <Button type="button" onClick={openCreateObjective} disabled={!cycleId || cycle?.status === 'closed'}>
                Tạo mục tiêu
              </Button>
            )}
          </>
        }
      />

      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}

      {/* Chọn chu kỳ + trạng thái */}
      <Card className="mb-5">
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 sm:max-w-xs">
              <FormField label="Chu kỳ đánh giá">
                <Select value={cycleId ?? ''} onChange={(e) => setCycleId(Number(e.target.value) || null)}>
                  {cycles.length === 0 && <option value="">Chưa có chu kỳ nào</option>}
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({fmtDate(c.start_date)} → {fmtDate(c.end_date)})</option>
                  ))}
                </Select>
              </FormField>
            </div>
            {cycle && (
              <div className="flex items-center gap-2 pb-1">
                <Badge tone={(CYCLE_STATUS[cycle.status] || {}).tone || 'slate'} dot>
                  {(CYCLE_STATUS[cycle.status] || {}).label || cycle.status}
                </Badge>
                {isHR && (CYCLE_NEXT[cycle.status] || []).map((next) => (
                  <Button key={next.to} type="button" variant="secondary" size="sm" onClick={() => handleCycleStatus(next.to)}>
                    {next.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Tổng quan chu kỳ */}
      {dashboard && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Nhân viên có mục tiêu" value={dashboard.summary?.employees ?? 0} sub="Trong phạm vi bạn được xem" />
            <StatCard label="Tổng số mục tiêu" value={dashboard.summary?.objectives ?? 0} sub="Không tính mục tiêu đã huỷ" />
            <StatCard label="Điểm tiến độ trung bình" value={`${dashboard.summary?.avg_progress ?? 0}`} sub="Thang 100 — tính từ tiến độ KR" />
            <StatCard label="Mục tiêu chờ duyệt" value={dashboard.summary?.pending_approvals ?? 0} sub="Cần Manager/HR xử lý" />
          </div>
          {dashboard.rating_distribution && Object.keys(dashboard.rating_distribution).length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-gray-500">Phân bổ xếp loại:</span>
              {Object.entries(dashboard.rating_distribution).map(([rating, count]) => (
                <Badge key={rating} tone={ratingTone(rating)} dot>{rating}: {count}</Badge>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px px-4 py-2 text-sm transition ${
              tab === t.key
                ? 'border-b-2 border-brand-600 font-medium text-brand-700'
                : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!cycleId && (
        <EmptyState
          title="Chưa có chu kỳ đánh giá nào"
          description={isHR ? 'Hãy tạo chu kỳ đầu tiên (ví dụ: quý hiện tại) để bắt đầu đặt mục tiêu.' : 'HR chưa tạo chu kỳ đánh giá. Vui lòng quay lại sau.'}
          action={isHR ? <Button type="button" onClick={() => setCycleModal(true)}>Tạo chu kỳ</Button> : undefined}
        />
      )}

      {cycleId && tab === 'mine' && hasProfile && (
        <div>
          {loadingData && objectives.length === 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-44 w-full" />
              <Skeleton className="h-44 w-full" />
            </div>
          ) : mineObjectives.length === 0 ? (
            <EmptyState
              title="Bạn chưa có mục tiêu nào trong chu kỳ này"
              description="Tạo mục tiêu đầu tiên kèm 1–5 Key Result đo được, hoặc áp dụng gợi ý mẫu theo chức vụ của bạn."
              action={<Button type="button" onClick={openCreateObjective}>Tạo mục tiêu</Button>}
            />
          ) : (
            <StaggerList className="grid gap-4 lg:grid-cols-2">
              {mineObjectives.map((obj, i) => (
                <StaggerItem key={obj.id} index={i}>
                  <ObjectiveCard
                    obj={obj}
                    isMine
                    onCheckin={openCheckin}
                    onEdit={openEditObjective}
                    onSubmit={handleSubmitObjective}
                    onDelete={handleDeleteObjective}
                  />
                </StaggerItem>
              ))}
            </StaggerList>
          )}

          {deptObjectives.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-base font-semibold text-gray-900">Mục tiêu phòng ban</h2>
              <StaggerList className="grid gap-4 lg:grid-cols-2">
                {deptObjectives.map((obj, i) => (
                  <StaggerItem key={obj.id} index={i}>
                    <ObjectiveCard obj={obj} isMine={obj.created_by === myId} onCheckin={openCheckin} onEdit={openEditObjective} onSubmit={handleSubmitObjective} onDelete={handleDeleteObjective} />
                  </StaggerItem>
                ))}
              </StaggerList>
            </div>
          )}
        </div>
      )}

      {cycleId && tab === 'team' && canTeam && (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Mục tiêu chờ duyệt" subtitle="Duyệt để mục tiêu có hiệu lực, hoặc trả lại kèm lý do để nhân viên chỉnh sửa." />
            <CardBody>
              {pendingObjectives.length === 0 ? (
                <p className="text-sm text-gray-500">Không có mục tiêu nào đang chờ duyệt.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pendingObjectives.map((obj) => (
                    <div key={obj.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{obj.title}</p>
                        <p className="text-[13px] text-gray-500">
                          {obj.employee_name || obj.department_name || '—'} · {(obj.key_results || []).length} Key Result
                        </p>
                      </div>
                      <Button type="button" size="sm" onClick={() => handleApprove(obj)}>Duyệt</Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => { setReturnModal({ open: true, obj }); setReturnNote(''); }}
                      >
                        Trả lại
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tiến độ team" subtitle="Điểm tiến độ tính tự động từ các lần check-in Key Result." />
            <div className="overflow-x-auto">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th className="ui-th">Nhân viên</th>
                    <th className="ui-th">Phòng ban</th>
                    <th className="ui-th">Số mục tiêu</th>
                    <th className="ui-th">Điểm tiến độ</th>
                    <th className="ui-th">Điểm chốt</th>
                    <th className="ui-th">Xếp loại</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.employees || []).map((row) => (
                    <tr key={row.employee_id} className="ui-tr">
                      <td className="ui-td font-medium text-gray-900">{row.employee_name}</td>
                      <td className="ui-td">{row.department_name || '—'}</td>
                      <td className="ui-td tabular-nums">{row.objectives_count}</td>
                      <td className="ui-td tabular-nums">{fmtNum(row.score)}</td>
                      <td className="ui-td tabular-nums">{row.final_score !== null && row.final_score !== undefined ? fmtNum(row.final_score) : '—'}</td>
                      <td className="ui-td">
                        {row.rating ? <Badge tone={ratingTone(row.rating)} dot>{row.rating}</Badge> : '—'}
                      </td>
                    </tr>
                  ))}
                  {(dashboard?.employees || []).length === 0 && (
                    <tr>
                      <td className="ui-td text-gray-500" colSpan={6}>Chưa có dữ liệu tiến độ trong chu kỳ này.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {(dashboard?.by_department || []).length > 0 && (
            <Card>
              <CardHeader title="Tiến độ theo phòng ban" />
              <CardBody>
                <div className="space-y-3">
                  {dashboard.by_department.map((d) => (
                    <div key={d.department_id} className="flex items-center gap-3">
                      <p className="w-44 truncate text-sm font-medium text-gray-800">{d.department_name}</p>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, d.avg_score))}%` }} />
                      </div>
                      <p className="w-24 text-right text-[13px] tabular-nums text-gray-500">
                        {fmtNum(d.avg_score)} · {d.employees} NV
                      </p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {cycleId && tab === 'review' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {hasProfile && (
          <Card>
            <CardHeader
              title="Tự đánh giá của tôi"
              subtitle={
                systemScoreFor(myId) !== null
                  ? `Điểm hệ thống gợi ý từ tiến độ KR: ${fmtNum(systemScoreFor(myId))} điểm`
                  : 'Điểm hệ thống gợi ý sẽ hiện khi bạn có mục tiêu trong chu kỳ.'
              }
            />
            <CardBody>
                <div className="space-y-4">
                  {mySelfReview && (
                    <Alert tone="success">
                      Bạn đã nộp tự đánh giá: <strong>{fmtNum(mySelfReview.score)} điểm</strong>. Có thể nộp lại để cập nhật.
                    </Alert>
                  )}
                  <FormField label="Điểm tự chấm (0–100)">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={selfForm.score}
                      onChange={(e) => setSelfForm((f) => ({ ...f, score: e.target.value }))}
                      placeholder="Ví dụ: 80"
                    />
                  </FormField>
                  <FormField label="Nhận xét">
                    <Textarea
                      rows={4}
                      value={selfForm.comment}
                      onChange={(e) => setSelfForm((f) => ({ ...f, comment: e.target.value }))}
                      placeholder="Kết quả nổi bật, khó khăn và bài học trong chu kỳ..."
                    />
                  </FormField>
                  <Button type="button" onClick={handleSelfReview} disabled={savingReview || cycle?.status === 'closed'}>
                    {mySelfReview ? 'Nộp lại tự đánh giá' : 'Nộp tự đánh giá'}
                  </Button>
                  {reviewsAboutMe.filter((r) => r.review_type === 'manager').map((r) => (
                    <Alert key={r.id} tone="info">
                      Kết quả từ quản lý: <strong>{fmtNum(r.score)} điểm</strong>
                      {r.comment ? ` — “${r.comment}”` : ''}
                    </Alert>
                  ))}
                </div>
            </CardBody>
          </Card>
          )}

          {canTeam && (
            <Card>
              <CardHeader title="Chấm điểm cho nhân viên" subtitle="Điểm chốt của Manager là kết quả cuối kỳ; khi nộp, mục tiêu đang hiệu lực của nhân viên sẽ hoàn thành." />
              <CardBody>
                <div className="space-y-4">
                  <FormField label="Nhân viên">
                    <Select value={mgrForm.employee_id} onChange={(e) => setMgrForm((f) => ({ ...f, employee_id: e.target.value }))}>
                      <option value="">— Chọn nhân viên —</option>
                      {reviewTargets.map((t) => (
                        <option key={t.id} value={t.id}>{t.name || `Nhân viên #${t.id}`}</option>
                      ))}
                    </Select>
                  </FormField>
                  {mgrForm.employee_id && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm text-gray-600">
                      <p>
                        Điểm hệ thống gợi ý: <strong className="text-gray-900">{fmtNum(systemScoreFor(Number(mgrForm.employee_id)))}</strong>
                        {ratingFor(systemScoreFor(Number(mgrForm.employee_id))) && (
                          <> · Xếp loại dự kiến: <strong className="text-gray-900">{ratingFor(systemScoreFor(Number(mgrForm.employee_id)))}</strong></>
                        )}
                      </p>
                      <p className="mt-1">
                        Tự đánh giá của nhân viên: {targetSelfReview
                          ? <><strong className="text-gray-900">{fmtNum(targetSelfReview.score)} điểm</strong>{targetSelfReview.comment ? ` — “${targetSelfReview.comment}”` : ''}</>
                          : 'chưa nộp'}
                      </p>
                    </div>
                  )}
                  <FormField label="Điểm chốt (0–100)">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={mgrForm.score}
                      onChange={(e) => setMgrForm((f) => ({ ...f, score: e.target.value }))}
                      placeholder="Ví dụ: 75"
                    />
                  </FormField>
                  <FormField label="Nhận xét">
                    <Textarea
                      rows={4}
                      value={mgrForm.comment}
                      onChange={(e) => setMgrForm((f) => ({ ...f, comment: e.target.value }))}
                      placeholder="Nhận xét về kết quả và định hướng phát triển..."
                    />
                  </FormField>
                  <Button type="button" onClick={handleManagerReview} disabled={savingReview || cycle?.status === 'closed'}>
                    Chấm điểm chốt
                  </Button>

                  {managerReviews.length > 0 && (
                    <div className="border-t border-gray-100 pt-4">
                      <p className="mb-2 text-[13px] font-medium text-gray-500">Đã chấm trong chu kỳ này</p>
                      <div className="space-y-2">
                        {managerReviews.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-gray-800">{r.employee_name || `Nhân viên #${r.employee_id}`}</span>
                            <span className="flex items-center gap-2">
                              <span className="tabular-nums font-semibold text-gray-900">{fmtNum(r.score)}</span>
                              {ratingFor(r.score) && <Badge tone={ratingTone(ratingFor(r.score))} dot>{ratingFor(r.score)}</Badge>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Modal tạo chu kỳ */}
      <Modal
        open={cycleModal}
        title="Tạo chu kỳ đánh giá"
        subtitle="Ví dụ: Q1/2027, từ 01/01/2027 đến 31/03/2027."
        onClose={() => setCycleModal(false)}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setCycleModal(false)}>Huỷ</Button>
            <Button type="button" onClick={handleCreateCycle} disabled={savingCycle}>{savingCycle ? 'Đang tạo...' : 'Tạo chu kỳ'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Tên chu kỳ">
            <Input value={cycleForm.name} onChange={(e) => setCycleForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ví dụ: Q1/2027" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ngày bắt đầu">
              <Input type="date" value={cycleForm.start_date} onChange={(e) => setCycleForm((f) => ({ ...f, start_date: e.target.value }))} />
            </FormField>
            <FormField label="Ngày kết thúc">
              <Input type="date" value={cycleForm.end_date} onChange={(e) => setCycleForm((f) => ({ ...f, end_date: e.target.value }))} />
            </FormField>
          </div>
        </div>
      </Modal>

      {/* Modal tạo / sửa mục tiêu */}
      <Modal
        open={objModal.open}
        title={objModal.editing ? 'Sửa mục tiêu' : 'Tạo mục tiêu'}
        subtitle={objModal.editing ? 'Sửa khi mục tiêu còn ở trạng thái nháp. Thay Key Result sẽ thay toàn bộ danh sách KR hiện tại.' : 'Mục tiêu được tạo ở trạng thái nháp — gửi duyệt sau khi hoàn thiện.'}
        onClose={() => setObjModal({ open: false, editing: null })}
        width="max-w-2xl"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setObjModal({ open: false, editing: null })}>Huỷ</Button>
            <Button type="button" onClick={handleSaveObjective} disabled={savingObj}>{savingObj ? 'Đang lưu...' : 'Lưu mục tiêu'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {!objModal.editing && suggestions.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
              <p className="mb-2 text-[13px] font-medium text-gray-700">Gợi ý mẫu theo chức vụ / phòng ban của bạn — bấm để điền sẵn:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Button key={s.title} type="button" variant="secondary" size="sm" onClick={() => applySuggestion(s)}>
                    {s.title}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {canTeam && !objModal.editing && (
            <FormField label="Mục tiêu cho">
              <Select value={objForm.employee_id} onChange={(e) => setObjForm((f) => ({ ...f, employee_id: e.target.value }))}>
                {hasProfile
                  ? <option value="me">Chính tôi</option>
                  : <option value="">— Chọn nhân viên —</option>}
                {employees.filter((e) => e.id !== myId).map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.code})</option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Tên mục tiêu">
            <Input value={objForm.title} onChange={(e) => setObjForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ví dụ: Đảm bảo chất lượng và tiến độ phát triển sản phẩm" />
          </FormField>
          <FormField label="Mô tả">
            <Textarea rows={2} value={objForm.description} onChange={(e) => setObjForm((f) => ({ ...f, description: e.target.value }))} placeholder="Không bắt buộc" />
          </FormField>
          <FormField label="Trọng số mục tiêu">
            <Input type="number" min="0" step="0.5" value={objForm.weight} onChange={(e) => setObjForm((f) => ({ ...f, weight: e.target.value }))} />
          </FormField>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Key Results (1–5)</p>
              {objForm.key_results.length < 5 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setObjForm((f) => ({ ...f, key_results: [...f.key_results, emptyKR()] }))}
                >
                  Thêm Key Result
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {objForm.key_results.map((kr, i) => (
                <div key={i} className="rounded-xl border border-gray-200 p-3.5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[13px] font-medium text-gray-500">Key Result {i + 1}</p>
                    {objForm.key_results.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-[#B42318] hover:bg-[#FEF3F2]"
                        onClick={() => setObjForm((f) => ({ ...f, key_results: f.key_results.filter((_, j) => j !== i) }))}
                      >
                        Xoá
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <Input value={kr.title} onChange={(e) => setKR(i, { title: e.target.value })} placeholder="Tên kết quả then chốt, ví dụ: Hoàn thành story point trong kỳ" />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <Input value={kr.unit} onChange={(e) => setKR(i, { unit: e.target.value })} placeholder="Đơn vị" />
                      <Input type="number" step="0.01" value={kr.target_value} onChange={(e) => setKR(i, { target_value: e.target.value })} placeholder="Mục tiêu" />
                      <Input type="number" step="0.01" value={kr.current_value} onChange={(e) => setKR(i, { current_value: e.target.value })} placeholder="Hiện tại" />
                      <Input type="number" step="0.5" min="0" value={kr.weight} onChange={(e) => setKR(i, { weight: e.target.value })} placeholder="Trọng số" />
                      <Select value={kr.direction} onChange={(e) => setKR(i, { direction: e.target.value })}>
                        <option value="increase">Tăng là tốt</option>
                        <option value="decrease">Giảm là tốt</option>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal check-in */}
      <Modal
        open={checkinModal.open}
        title="Check-in tiến độ"
        subtitle={checkinModal.kr ? `${checkinModal.kr.title} — mục tiêu hiện tại: ${fmtNum(checkinModal.kr.current_value)} / ${fmtNum(checkinModal.kr.target_value)}${checkinModal.kr.unit ? ` ${checkinModal.kr.unit}` : ''}` : ''}
        onClose={() => setCheckinModal({ open: false, kr: null, obj: null })}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setCheckinModal({ open: false, kr: null, obj: null })}>Đóng</Button>
            <Button type="button" onClick={handleCheckin} disabled={savingCheckin}>{savingCheckin ? 'Đang lưu...' : 'Lưu check-in'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Giá trị hiện tại mới">
            <Input
              type="number"
              step="0.01"
              value={checkinForm.new_value}
              onChange={(e) => setCheckinForm((f) => ({ ...f, new_value: e.target.value }))}
            />
          </FormField>
          <FormField label="Ghi chú">
            <Textarea rows={2} value={checkinForm.note} onChange={(e) => setCheckinForm((f) => ({ ...f, note: e.target.value }))} placeholder="Không bắt buộc — ví dụ: hoàn thành mốc tuần này" />
          </FormField>
          {checkinHistory.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="mb-2 text-[13px] font-medium text-gray-500">Lịch sử check-in</p>
              <div className="space-y-2">
                {checkinHistory.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="tabular-nums text-gray-800">
                      {fmtNum(c.old_value)} → <strong>{fmtNum(c.new_value)}</strong>
                      {c.note ? <span className="text-gray-500"> · {c.note}</span> : null}
                    </span>
                    <span className="text-[13px] text-gray-400">
                      {c.author_name || ''} · {c.created_at ? new Date(c.created_at).toLocaleString('vi-VN') : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal trả lại mục tiêu */}
      <Modal
        open={returnModal.open}
        title="Trả lại mục tiêu"
        subtitle={returnModal.obj ? `“${returnModal.obj.title}” sẽ quay về trạng thái nháp để nhân viên chỉnh sửa.` : ''}
        onClose={() => setReturnModal({ open: false, obj: null })}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setReturnModal({ open: false, obj: null })}>Huỷ</Button>
            <Button type="button" variant="danger" onClick={handleReturn}>Trả lại</Button>
          </>
        }
      >
        <FormField label="Lý do trả lại">
          <Textarea rows={3} value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="Ví dụ: cần bổ sung Key Result đo được rõ hơn" />
        </FormField>
      </Modal>
    </div>
  );
}
