// Trang Cửa hàng quà & Điểm thưởng — route /rewards
// - Mọi nhân viên: xem số dư điểm (tự đồng bộ từ kudo / khoá học hoàn
//   thành / ngày đi làm đúng giờ), đổi quà bằng điểm, theo dõi yêu cầu.
// - HR/Admin: thêm panel quản lý catalog quà + hàng chờ duyệt đổi quà
//   (duyệt mới trừ điểm và giảm tồn kho — xử lý ở backend).
// Trình bày theo hợp đồng thiết kế v4: thẻ phẳng border gray-200, UI kit.
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../app/AuthContext.jsx';
import PageLoading from '../../../app/PageLoading.jsx';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
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
  IconCheck,
  IconX,
  IconSparkles,
  IconWallet,
  IconClock,
} from '../../../components/icons.jsx';
import {
  getMyPoints,
  getRewards,
  getAllRewards,
  createReward,
  updateReward,
  getRedemptions,
  createRedemption,
  decideRedemption,
  parseApiError,
} from '../services';

const SOURCE_LABELS = {
  kudo_received: 'Nhận kudo',
  training_completed: 'Hoàn thành khoá học',
  ontime_day: 'Đi làm đúng giờ',
  redemption: 'Đổi quà',
  manual: 'Điều chỉnh',
};

const REDEMPTION_STATUS = {
  pending: { label: 'Chờ duyệt', tone: 'amber' },
  approved: { label: 'Đã duyệt', tone: 'green' },
  rejected: { label: 'Đã từ chối', tone: 'red' },
};

function getRoleFallback() {
  try {
    const raw = localStorage.getItem('hrm_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.role) return u.role;
    }
  } catch {
    /* bỏ qua */
  }
  return null;
}

function formatPoints(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('vi-VN');
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const errorInputClass = (hasError) =>
  hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/15' : '';

// ===========================================================================
// Trang chính
// ===========================================================================

// Guard đầu trang: Cửa hàng quà chỉ dành cho tài khoản đã gắn hồ sơ nhân
// viên — điểm thưởng / đổi quà đều gắn với hồ sơ. Tài khoản không có hồ sơ
// (vd Admin hệ thống thuần) được điều hướng về trang chủ thay vì vào trang
// rồi nhận banner lỗi. Component cha mảnh này chỉ gọi useAuth và return
// sớm theo điều kiện phiên, không vi phạm Rules of Hooks; toàn bộ hooks
// của trang nằm ở component nội dung bên dưới.
export default function RewardsPage() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  if (user?.employeeId == null) return <Navigate to="/" replace />;
  return <RewardsPageContent />;
}

function RewardsPageContent() {
  const { user } = useAuth();
  const role = String(user?.role || getRoleFallback() || '').toLowerCase();
  const isHrAdmin = role === 'admin' || role === 'hr';

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');

  const [points, setPoints] = useState(null);
  const [pointsError, setPointsError] = useState('');
  const [rewards, setRewards] = useState([]);
  const [allRewards, setAllRewards] = useState([]);
  const [myRedemptions, setMyRedemptions] = useState([]);
  const [pendingQueue, setPendingQueue] = useState([]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [redeemTarget, setRedeemTarget] = useState(null);
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [rewardForm, setRewardForm] = useState(null); // { mode, reward? }
  const [decisionTarget, setDecisionTarget] = useState(null); // { redemption, decision }

  const loadAll = useCallback(async () => {
    setPageError('');
    try {
      const [rewardsRes, myRes] = await Promise.all([
        getRewards(),
        getRedemptions({ scope: 'mine', limit: 50 }),
      ]);
      setRewards(rewardsRes.items);
      setMyRedemptions(myRes.items);
    } catch (err) {
      setPageError(parseApiError(err, 'Không tải được dữ liệu cửa hàng quà.').message);
    }
    // Điểm của tôi: trang đã được guard ở đầu — chỉ tài khoản có hồ sơ
    // nhân viên mới vào được, nên lỗi ở đây là lỗi thật (mạng/server):
    // chỉ ẩn khu số dư, không chặn cả trang.
    try {
      const data = await getMyPoints();
      setPoints(data);
      setPointsError('');
    } catch (err) {
      setPoints(null);
      setPointsError(parseApiError(err).message);
    }
    if (isHrAdmin) {
      try {
        const [allRes, queueRes] = await Promise.all([
          getAllRewards(),
          getRedemptions({ scope: 'all', status: 'pending', limit: 50 }),
        ]);
        setAllRewards(allRes.items);
        setPendingQueue(queueRes.items);
      } catch {
        /* panel quản lý lỗi thì bỏ qua, phần nhân viên vẫn dùng được */
      }
    }
    setLoading(false);
  }, [isHrAdmin]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const balance = points?.balance ?? 0;

  async function handleRedeemConfirm() {
    if (!redeemTarget) return;
    setRedeemBusy(true);
    try {
      await createRedemption(redeemTarget.id);
      setNotice(
        `Đã gửi yêu cầu đổi "${redeemTarget.name}". HR duyệt xong điểm mới bị trừ — bạn sẽ thấy trạng thái ở mục "Yêu cầu của tôi".`,
      );
      setRedeemTarget(null);
      await loadAll();
    } catch (err) {
      setNotice('');
      setPageError(parseApiError(err, 'Gửi yêu cầu đổi quà thất bại.').message);
      setRedeemTarget(null);
    } finally {
      setRedeemBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="Cửa hàng quà"
        subtitle="Điểm thưởng tích luỹ từ kudo, học tập và chuyên cần — đổi lấy phúc lợi của công ty. Yêu cầu đổi quà được HR duyệt trước khi trừ điểm."
      />

      {notice && (
        <Alert tone="success" className="mb-4">
          {notice}
        </Alert>
      )}
      {pageError && (
        <Alert tone="error" className="mb-4">
          <span className="flex flex-wrap items-center gap-3">
            <span>{pageError}</span>
            <Button variant="secondary" size="sm" onClick={loadAll}>
              Thử lại
            </Button>
          </span>
        </Alert>
      )}

      {/* ------------------------------ Số dư điểm ------------------------------ */}
      {loading ? (
        <Skeleton className="mb-6 h-28 w-full" />
      ) : points ? (
        <Card className="mb-6">
          <CardBody>
            <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
              <div>
                <div className="flex items-center gap-2 text-[13px] font-medium text-gray-500">
                  <IconWallet size={15} />
                  Số dư điểm của tôi
                </div>
                <div className="mt-1 text-4xl font-semibold tracking-[-0.01em] text-gray-900 tabular-nums">
                  {formatPoints(points.balance)}
                  <span className="ml-2 text-base font-medium text-gray-400">điểm</span>
                </div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-gray-500">Tổng điểm đã kiếm</div>
                <div className="mt-1 text-xl font-semibold text-emerald-600 tabular-nums">
                  +{formatPoints(points.total_earned)}
                </div>
              </div>
              <div>
                <div className="text-[13px] font-medium text-gray-500">Tổng điểm đã tiêu</div>
                <div className="mt-1 text-xl font-semibold text-gray-900 tabular-nums">
                  −{formatPoints(points.total_spent)}
                </div>
              </div>
              <div className="ml-auto">
                <Button
                  variant="secondary"
                  onClick={() => setHistoryOpen(true)}
                >
                  <IconClock size={16} className="mr-1.5" />
                  Lịch sử điểm
                </Button>
              </div>
            </div>
            <p className="mt-4 border-t border-gray-100 pt-3 text-[13px] leading-relaxed text-gray-500">
              Cách kiếm điểm: nhận 1 kudo <strong className="text-gray-700">+10</strong> ·
              hoàn thành 1 khoá học <strong className="text-gray-700">+50</strong> ·
              mỗi ngày đi làm đúng giờ <strong className="text-gray-700">+2</strong>.
              Điểm được hệ thống tự đồng bộ từ dữ liệu thật của bạn.
            </p>
          </CardBody>
        </Card>
      ) : pointsError ? (
        <Alert tone="info" className="mb-6">
          {pointsError}
        </Alert>
      ) : null}

      {/* ------------------------------ Lưới quà ------------------------------ */}
      <div className="mb-3 flex items-center gap-2">
        <IconSparkles size={17} className="text-gray-500" />
        <h2 className="text-[15px] font-semibold text-gray-900">Quà tặng đang mở đổi</h2>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : rewards.length === 0 ? (
        <EmptyState
          icon={<IconSparkles size={26} />}
          title="Chưa có quà nào đang mở đổi"
          description="HR sẽ bổ sung quà vào cửa hàng. Trong lúc chờ, bạn cứ tích điểm từ kudo, khoá học và ngày đi làm đúng giờ nhé."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rewards.map((reward) => {
            const outOfStock = reward.stock !== null && reward.stock <= 0;
            const canRedeem = !outOfStock && points !== null && balance >= reward.points_cost;
            return (
              <Card key={reward.id} className="flex flex-col">
                <CardBody className="flex flex-1 flex-col">
                  <div className="text-5xl leading-none" aria-hidden="true">
                    {reward.image_emoji || '🎁'}
                  </div>
                  <h3 className="mt-3 text-[15px] font-semibold text-gray-900">{reward.name}</h3>
                  {reward.description && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-500">
                      {reward.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-2">
                    <Badge tone="blue">{formatPoints(reward.points_cost)} điểm</Badge>
                    <span className="text-[13px] text-gray-500">
                      {reward.stock === null
                        ? 'Không giới hạn số lượng'
                        : outOfStock
                          ? 'Đã hết hàng'
                          : `Còn ${reward.stock} phần`}
                    </span>
                  </div>
                  <div className="mt-4 flex-1" />
                  <Button
                    variant="primary"
                    className="w-full"
                    disabled={!canRedeem}
                    onClick={() => setRedeemTarget(reward)}
                  >
                    {outOfStock
                      ? 'Hết hàng'
                      : points !== null && balance < reward.points_cost
                        ? `Thiếu ${formatPoints(reward.points_cost - balance)} điểm`
                        : 'Đổi quà'}
                  </Button>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* ------------------------------ Yêu cầu của tôi ------------------------------ */}
      <Card className="mt-6">
        <CardHeader
          title="Yêu cầu đổi quà của tôi"
          subtitle="Điểm chỉ bị trừ sau khi HR duyệt yêu cầu."
        />
        <CardBody>
          {loading ? (
            <TableSkeleton rows={3} />
          ) : myRedemptions.length === 0 ? (
            <EmptyState
              icon={<IconWallet size={26} />}
              title="Bạn chưa đổi quà lần nào"
              description="Khi đủ điểm, bấm “Đổi quà” ở một món phía trên để gửi yêu cầu đầu tiên."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[13px] text-gray-500">
                    <th className="py-2 pr-4 font-medium">Quà</th>
                    <th className="py-2 pr-4 font-medium">Giá điểm</th>
                    <th className="py-2 pr-4 font-medium">Ngày gửi</th>
                    <th className="py-2 pr-4 font-medium">Trạng thái</th>
                    <th className="py-2 font-medium">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {myRedemptions.map((item) => {
                    const meta = REDEMPTION_STATUS[item.status] || REDEMPTION_STATUS.pending;
                    return (
                      <tr key={item.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 pr-4">
                          <span className="mr-2 text-lg" aria-hidden="true">
                            {item.reward?.image_emoji || '🎁'}
                          </span>
                          <span className="font-medium text-gray-900">{item.reward?.name || '—'}</span>
                        </td>
                        <td className="py-3 pr-4 tabular-nums text-gray-700">
                          {formatPoints(item.points_cost)}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">{formatDateTime(item.created_at)}</td>
                        <td className="py-3 pr-4">
                          <Badge tone={meta.tone} dot>
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="py-3 text-gray-500">{item.note || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------ Panel HR/Admin ------------------------------ */}
      {isHrAdmin && !loading && (
        <>
          <Card className="mt-6">
            <CardHeader
              title="Quản lý quà tặng"
              subtitle="Tạo, sửa giá điểm / tồn kho hoặc tạm khoá quà."
              actions={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setRewardForm({ mode: 'create' })}
                >
                  <IconPlus size={15} className="mr-1" />
                  Thêm quà
                </Button>
              }
            />
            <CardBody>
              {allRewards.length === 0 ? (
                <EmptyState
                  icon={<IconSparkles size={26} />}
                  title="Chưa có quà nào trong catalog"
                  description="Bấm “Thêm quà” để tạo món quà đầu tiên cho cửa hàng."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-[13px] text-gray-500">
                        <th className="py-2 pr-4 font-medium">Quà</th>
                        <th className="py-2 pr-4 font-medium">Giá điểm</th>
                        <th className="py-2 pr-4 font-medium">Tồn kho</th>
                        <th className="py-2 pr-4 font-medium">Trạng thái</th>
                        <th className="py-2 text-right font-medium">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRewards.map((reward) => (
                        <tr key={reward.id} className="border-b border-gray-100 last:border-0">
                          <td className="py-3 pr-4">
                            <span className="mr-2 text-lg" aria-hidden="true">
                              {reward.image_emoji || '🎁'}
                            </span>
                            <span className="font-medium text-gray-900">{reward.name}</span>
                          </td>
                          <td className="py-3 pr-4 tabular-nums text-gray-700">
                            {formatPoints(reward.points_cost)}
                          </td>
                          <td className="py-3 pr-4 text-gray-700">
                            {reward.stock === null ? 'Không giới hạn' : reward.stock}
                          </td>
                          <td className="py-3 pr-4">
                            <Badge tone={reward.is_active ? 'green' : 'slate'} dot>
                              {reward.is_active ? 'Đang mở đổi' : 'Tạm khoá'}
                            </Badge>
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setRewardForm({ mode: 'edit', reward })}
                              aria-label={`Sửa ${reward.name}`}
                              title="Sửa"
                              className="rounded-lg p-2 text-gray-400 transition duration-150 hover:bg-gray-100 hover:text-gray-700"
                            >
                              <IconEdit size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="mt-6">
            <CardHeader
              title="Yêu cầu đổi quà chờ duyệt"
              subtitle="Duyệt xong hệ thống mới trừ điểm của nhân viên và giảm tồn kho."
            />
            <CardBody>
              {pendingQueue.length === 0 ? (
                <EmptyState
                  icon={<IconCheck size={26} />}
                  title="Không có yêu cầu nào đang chờ"
                  description="Mọi yêu cầu đổi quà đã được xử lý."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-[13px] text-gray-500">
                        <th className="py-2 pr-4 font-medium">Nhân viên</th>
                        <th className="py-2 pr-4 font-medium">Quà</th>
                        <th className="py-2 pr-4 font-medium">Giá điểm</th>
                        <th className="py-2 pr-4 font-medium">Ngày gửi</th>
                        <th className="py-2 text-right font-medium">Quyết định</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingQueue.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0">
                          <td className="py-3 pr-4">
                            <div className="font-medium text-gray-900">
                              {item.employee?.full_name || '—'}
                            </div>
                            <div className="text-[13px] text-gray-500">
                              {item.employee?.code || ''}
                              {item.employee?.department_name
                                ? ` · ${item.employee.department_name}`
                                : ''}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="mr-2 text-lg" aria-hidden="true">
                              {item.reward?.image_emoji || '🎁'}
                            </span>
                            {item.reward?.name || '—'}
                          </td>
                          <td className="py-3 pr-4 tabular-nums text-gray-700">
                            {formatPoints(item.points_cost)}
                          </td>
                          <td className="py-3 pr-4 text-gray-500">
                            {formatDateTime(item.created_at)}
                          </td>
                          <td className="py-3 text-right">
                            <span className="inline-flex gap-2">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setDecisionTarget({ redemption: item, decision: 'approve' })}
                              >
                                <IconCheck size={14} className="mr-1" />
                                Duyệt
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDecisionTarget({ redemption: item, decision: 'reject' })}
                              >
                                <IconX size={14} className="mr-1" />
                                Từ chối
                              </Button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* ------------------------------ Modals ------------------------------ */}
      {historyOpen && (
        <HistoryModal
          entries={points?.recent || []}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {redeemTarget && (
        <RedeemModal
          reward={redeemTarget}
          balance={balance}
          busy={redeemBusy}
          onClose={() => !redeemBusy && setRedeemTarget(null)}
          onConfirm={handleRedeemConfirm}
        />
      )}
      {rewardForm && (
        <RewardFormModal
          mode={rewardForm.mode}
          reward={rewardForm.reward}
          onClose={() => setRewardForm(null)}
          onSaved={async () => {
            setRewardForm(null);
            setNotice('Đã lưu quà tặng.');
            await loadAll();
          }}
        />
      )}
      {decisionTarget && (
        <DecisionModal
          target={decisionTarget}
          onClose={() => setDecisionTarget(null)}
          onDone={async (decision) => {
            setDecisionTarget(null);
            setNotice(
              decision === 'approve'
                ? 'Đã duyệt yêu cầu — điểm của nhân viên đã được trừ và tồn kho đã giảm.'
                : 'Đã từ chối yêu cầu đổi quà.',
            );
            await loadAll();
          }}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Modal: lịch sử điểm
// ===========================================================================

function HistoryModal({ entries, onClose }) {
  return (
    <Modal open title="Lịch sử điểm gần nhất" onClose={onClose} width="max-w-xl">
      {entries.length === 0 ? (
        <EmptyState
          icon={<IconClock size={26} />}
          title="Chưa có biến động điểm"
          description="Điểm sẽ xuất hiện khi bạn nhận kudo, hoàn thành khoá học hoặc đi làm đúng giờ."
        />
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 w-16 shrink-0 text-right text-[15px] font-semibold tabular-nums ${
                  entry.delta >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {entry.delta >= 0 ? '+' : '−'}
                {formatPoints(Math.abs(entry.delta))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {entry.note || SOURCE_LABELS[entry.source_type] || entry.source_type}
                </span>
                <span className="mt-0.5 block text-[13px] text-gray-500">
                  {SOURCE_LABELS[entry.source_type] || entry.source_type} ·{' '}
                  {formatDateTime(entry.created_at)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ===========================================================================
// Modal: xác nhận đổi quà
// ===========================================================================

function RedeemModal({ reward, balance, busy, onClose, onConfirm }) {
  return (
    <Modal
      open
      title="Xác nhận đổi quà"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={busy}>
            {busy ? 'Đang gửi…' : 'Gửi yêu cầu'}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className="text-5xl leading-none" aria-hidden="true">
          {reward.image_emoji || '🎁'}
        </div>
        <div>
          <div className="text-[15px] font-semibold text-gray-900">{reward.name}</div>
          {reward.description && (
            <p className="mt-1 text-sm leading-relaxed text-gray-500">{reward.description}</p>
          )}
          <div className="mt-3 space-y-1 text-sm text-gray-600">
            <div>
              Giá: <strong className="text-gray-900">{formatPoints(reward.points_cost)} điểm</strong>
            </div>
            <div>
              Số dư hiện tại: <strong className="text-gray-900">{formatPoints(balance)} điểm</strong>
              {' → '}
              sau khi được duyệt:{' '}
              <strong className="text-gray-900">
                {formatPoints(balance - reward.points_cost)} điểm
              </strong>
            </div>
          </div>
        </div>
      </div>
      <Alert tone="info" className="mt-4">
        Yêu cầu sẽ ở trạng thái chờ duyệt — điểm chỉ bị trừ khi HR duyệt và quà còn hàng.
      </Alert>
    </Modal>
  );
}

// ===========================================================================
// Modal: tạo / sửa quà (HR/Admin)
// ===========================================================================

function RewardFormModal({ mode, reward, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    name: reward?.name || '',
    description: reward?.description || '',
    points_cost: reward ? String(reward.points_cost) : '',
    stock: reward && reward.stock !== null ? String(reward.stock) : '',
    image_emoji: reward?.image_emoji || '🎁',
    is_active: reward ? (reward.is_active ? 'active' : 'inactive') : 'active',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});
    const cost = Number.parseInt(form.points_cost, 10);
    if (!form.name.trim()) {
      setFieldErrors({ name: 'Tên quà là bắt buộc.' });
      return;
    }
    if (!Number.isInteger(cost) || cost <= 0) {
      setFieldErrors({ points_cost: 'Giá điểm phải là số nguyên dương.' });
      return;
    }
    let stock = null;
    if (form.stock !== '') {
      stock = Number.parseInt(form.stock, 10);
      if (!Number.isInteger(stock) || stock < 0) {
        setFieldErrors({ stock: 'Tồn kho phải là số nguyên ≥ 0, hoặc để trống = không giới hạn.' });
        return;
      }
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      points_cost: cost,
      stock,
      image_emoji: form.image_emoji.trim() || '🎁',
      is_active: form.is_active === 'active',
    };
    setSaving(true);
    try {
      if (isEdit) {
        await updateReward(reward.id, payload);
      } else {
        await createReward(payload);
      }
      onSaved();
    } catch (err) {
      const parsed = parseApiError(err, 'Lưu quà tặng thất bại.');
      setFormError(parsed.message);
      setFieldErrors(parsed.fieldErrors);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Sửa quà tặng' : 'Thêm quà tặng'}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button variant="primary" type="submit" form="reward-form" loading={saving}>
            {saving ? 'Đang lưu…' : 'Lưu quà'}
          </Button>
        </>
      }
    >
      <form id="reward-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <FormField label="Tên quà" required error={fieldErrors.name}>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="VD: Voucher cà phê 50.000đ"
            className={errorInputClass(!!fieldErrors.name)}
          />
        </FormField>
        <FormField label="Mô tả">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Mô tả ngắn về món quà (không bắt buộc)"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Giá điểm" required error={fieldErrors.points_cost}>
            <Input
              type="number"
              min="1"
              value={form.points_cost}
              onChange={(e) => set('points_cost', e.target.value)}
              placeholder="VD: 150"
              className={errorInputClass(!!fieldErrors.points_cost)}
            />
          </FormField>
          <FormField label="Tồn kho (trống = không giới hạn)" error={fieldErrors.stock}>
            <Input
              type="number"
              min="0"
              value={form.stock}
              onChange={(e) => set('stock', e.target.value)}
              placeholder="Không giới hạn"
              className={errorInputClass(!!fieldErrors.stock)}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Emoji hiển thị" error={fieldErrors.image_emoji}>
            <Input
              value={form.image_emoji}
              onChange={(e) => set('image_emoji', e.target.value)}
              maxLength={10}
              className={errorInputClass(!!fieldErrors.image_emoji)}
            />
          </FormField>
          <FormField label="Trạng thái">
            <Select value={form.is_active} onChange={(e) => set('is_active', e.target.value)}>
              <option value="active">Đang mở đổi</option>
              <option value="inactive">Tạm khoá</option>
            </Select>
          </FormField>
        </div>
      </form>
    </Modal>
  );
}

// ===========================================================================
// Modal: duyệt / từ chối yêu cầu đổi quà (HR/Admin)
// ===========================================================================

function DecisionModal({ target, onClose, onDone }) {
  const { redemption, decision } = target;
  const isApprove = decision === 'approve';
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setBusy(true);
    setError('');
    try {
      await decideRedemption(redemption.id, decision, note.trim());
      onDone(decision);
    } catch (err) {
      setError(parseApiError(err, 'Xử lý yêu cầu thất bại.').message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={isApprove ? 'Duyệt yêu cầu đổi quà' : 'Từ chối yêu cầu đổi quà'}
      onClose={() => !busy && onClose()}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button
            variant={isApprove ? 'primary' : 'danger'}
            onClick={handleConfirm}
            loading={busy}
          >
            {busy ? 'Đang xử lý…' : isApprove ? 'Duyệt & trừ điểm' : 'Từ chối yêu cầu'}
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="space-y-1.5 text-sm text-gray-600">
        <div>
          Nhân viên:{' '}
          <strong className="text-gray-900">{redemption.employee?.full_name || '—'}</strong>
          {redemption.employee?.code ? ` (${redemption.employee.code})` : ''}
        </div>
        <div>
          Quà:{' '}
          <strong className="text-gray-900">
            {redemption.reward?.image_emoji || '🎁'} {redemption.reward?.name || '—'}
          </strong>
        </div>
        <div>
          Giá điểm:{' '}
          <strong className="text-gray-900">{formatPoints(redemption.points_cost)} điểm</strong>
        </div>
      </div>
      {isApprove && (
        <Alert tone="info" className="mt-4">
          Khi duyệt, hệ thống kiểm tra lại số dư của nhân viên, trừ điểm và giảm 1 tồn kho
          (nếu quà có giới hạn số lượng).
        </Alert>
      )}
      <FormField label="Ghi chú (không bắt buộc)" className="mt-4">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isApprove ? 'VD: Nhận quà tại quầy lễ tân' : 'VD: Quà tạm hết, thử lại sau'}
        />
      </FormField>
    </Modal>
  );
}
