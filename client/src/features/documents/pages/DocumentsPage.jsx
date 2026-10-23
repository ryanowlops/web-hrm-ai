// Trang Hồ sơ & giấy tờ — route /documents
// Hai khu: (1) Hồ sơ nhân viên — kho tài liệu điện tử theo từng nhân viên
// (tải lên/tải xuống/xoá theo scope, badge cảnh báo hết hạn), (2) Giấy xác
// nhận — nhân viên xin giấy xác nhận lương/công tác, HR/Admin cấp phép và
// tải file .txt đã sinh. Trình bày theo hợp đồng thiết kế v4 (phẳng).
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
import {
  IconPlus,
  IconUpload,
  IconDownload,
  IconTrash,
  IconFileText,
  IconEye,
} from '../../../components/icons.jsx';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  downloadDocument,
  getExpiringDocuments,
  getCertificates,
  createCertificate,
  decideCertificate,
  downloadCertificate,
  parseApiError,
} from '../services';
import { getEmployees } from '../../employees/services';

const DOC_TYPES = [
  { value: 'contract', label: 'Hợp đồng lao động' },
  { value: 'cccd', label: 'CCCD / CMND' },
  { value: 'degree', label: 'Bằng cấp' },
  { value: 'certificate', label: 'Chứng chỉ' },
  { value: 'other', label: 'Khác' },
];
const docTypeLabel = (v) => DOC_TYPES.find((t) => t.value === v)?.label || v || '—';

const CERT_TYPES = [
  { value: 'salary', label: 'Giấy xác nhận lương' },
  { value: 'employment', label: 'Giấy xác nhận công tác' },
];
const certTypeLabel = (v) => CERT_TYPES.find((t) => t.value === v)?.label || v || '—';

const CERT_STATUS_META = {
  pending: { label: 'Chờ cấp', tone: 'amber' },
  approved: { label: 'Đã cấp', tone: 'green' },
  rejected: { label: 'Đã từ chối', tone: 'red' },
};

const BLOCKED_EXTS = ['exe', 'sh', 'bat', 'cmd', 'ps1', 'msi', 'com', 'scr', 'vbs', 'jar'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('vi-VN');
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ExpiryCell({ doc }) {
  if (!doc.expiry_date) return <span className="text-gray-400">Không hết hạn</span>;
  if (doc.is_expired) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="tabular-nums text-gray-700">{fmtDate(doc.expiry_date)}</span>
        <Badge tone="red" dot>Đã hết hạn</Badge>
      </span>
    );
  }
  if (doc.days_to_expiry !== null && doc.days_to_expiry <= 30) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="tabular-nums text-gray-700">{fmtDate(doc.expiry_date)}</span>
        <Badge tone="amber" dot>Còn {doc.days_to_expiry} ngày</Badge>
      </span>
    );
  }
  return <span className="tabular-nums text-gray-700">{fmtDate(doc.expiry_date)}</span>;
}

const tableHead = (showEmployee) => (
  <thead className="bg-gray-50">
    <tr>
      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Tài liệu</th>
      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Loại</th>
      {showEmployee && <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Nhân viên</th>}
      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Hết hạn</th>
      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Người tải lên</th>
      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Thao tác</th>
    </tr>
  </thead>
);

export default function DocumentsPage() {
  const { user } = useAuth();
  const role = user?.role;
  const canManage = role === 'admin' || role === 'hr';
  const hasProfile = Boolean(user?.employeeId);
  // Upload tự phục vụ chỉ khi tài khoản đã gắn hồ sơ (server trả
  // NO_EMPLOYEE_PROFILE nếu chưa gắn); HR/Admin tải cho người khác
  // không phụ thuộc hồ sơ của chính họ.
  const canUpload = canManage || (role === 'employee' && hasProfile);
  const canDelete = canManage || role === 'employee';
  // Kho tài liệu: HR/Admin quản trị toàn công ty nên không cần hồ sơ
  // cá nhân; manager (theo team) và employee (của mình) đều suy scope
  // từ hồ sơ cá nhân — chưa gắn hồ sơ thì kho luôn rỗng, ẩn hẳn.
  const showDocVault = canManage || hasProfile;

  // --- Hồ sơ nhân viên ---
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [documents, setDocuments] = useState([]);
  const [docMeta, setDocMeta] = useState(null);
  const [docPage, setDocPage] = useState(1);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState('');
  const [expiring, setExpiring] = useState([]);

  // --- Giấy xác nhận ---
  const [myCerts, setMyCerts] = useState([]);
  const [certQueue, setCertQueue] = useState([]);
  const [certsLoading, setCertsLoading] = useState(true);
  const [certsError, setCertsError] = useState('');

  // --- Modals ---
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [certFormOpen, setCertFormOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState(null); // { req, decision }
  const [preview, setPreview] = useState(null); // { id, content }
  const [actionError, setActionError] = useState('');

  const loadEmployees = useCallback(async () => {
    if (role === 'employee' || !showDocVault) return;
    try {
      const { items } = await getEmployees({ limit: 100 });
      setEmployees(items || []);
    } catch {
      setEmployees([]);
    }
  }, [role, showDocVault]);

  const loadDocuments = useCallback(async () => {
    if (!showDocVault) {
      setDocsLoading(false);
      return;
    }
    setDocsLoading(true);
    setDocsError('');
    try {
      const params = { page: docPage, limit: 20 };
      if (role !== 'employee' && selectedEmployeeId) params.employee_id = selectedEmployeeId;
      const { items, meta } = await getDocuments(params);
      setDocuments(items || []);
      setDocMeta(meta);
    } catch (err) {
      setDocsError(parseApiError(err, 'Không tải được danh sách tài liệu.').message);
    } finally {
      setDocsLoading(false);
    }
  }, [role, selectedEmployeeId, docPage, showDocVault]);

  const loadExpiring = useCallback(async () => {
    if (!canManage) return;
    try {
      const { items } = await getExpiringDocuments({ days: 30, limit: 100 });
      setExpiring(items || []);
    } catch {
      setExpiring([]);
    }
  }, [canManage]);

  const loadCertificates = useCallback(async () => {
    // Chưa gắn hồ sơ và không thuộc HR/Admin: cả khu giấy xác nhận bị
    // ẩn, không gọi API thừa.
    if (!hasProfile && !canManage) {
      setCertsLoading(false);
      return;
    }
    setCertsLoading(true);
    setCertsError('');
    try {
      // "Đơn của tôi" chỉ tồn tại khi tài khoản đã gắn hồ sơ nhân viên
      // (admin/HR chưa gắn hồ sơ vẫn tải hàng chờ cấp bình thường).
      if (hasProfile) {
        const mine = await getCertificates({ scope: 'mine', limit: 100 });
        setMyCerts(mine.items || []);
      }
      if (canManage) {
        const queue = await getCertificates({ status: 'pending', limit: 100 });
        setCertQueue(queue.items || []);
      }
    } catch (err) {
      setCertsError(parseApiError(err, 'Không tải được danh sách giấy xác nhận.').message);
    } finally {
      setCertsLoading(false);
    }
  }, [canManage, hasProfile]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  useEffect(() => { loadExpiring(); }, [loadExpiring]);
  useEffect(() => { loadCertificates(); }, [loadCertificates]);

  const handleDownloadDoc = async (doc) => {
    setActionError('');
    try {
      await downloadDocument(doc.id, doc.original_filename);
    } catch (err) {
      setActionError(parseApiError(err, 'Không tải xuống được tài liệu.').message);
    }
  };

  const handleDeleteDoc = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
      loadDocuments();
      loadExpiring();
    } catch (err) {
      setActionError(parseApiError(err, 'Không xoá được tài liệu.').message);
      setDeleteTarget(null);
    }
  };

  const handleDecide = async (note) => {
    if (!decisionTarget) return;
    const { req, decision } = decisionTarget;
    const result = await decideCertificate(req.id, { decision, note });
    setDecisionTarget(null);
    loadCertificates();
    if (decision === 'approve' && result?.issued_content) {
      setPreview({ id: result.id, content: result.issued_content });
    }
  };

  const showEmployeeColumn = role !== 'employee' && !selectedEmployeeId;

  return (
    <div>
      <PageHeader
        title="Hồ sơ & giấy tờ"
        subtitle="Kho tài liệu điện tử của nhân viên và giấy xác nhận lương / công tác."
        actions={(
          <>
            {hasProfile && (
              <Button variant="secondary" onClick={() => setCertFormOpen(true)}>
                <IconFileText size={16} /> Xin giấy xác nhận
              </Button>
            )}
            {canUpload && (
              <Button onClick={() => setUploadOpen(true)}>
                <IconUpload size={16} /> Tải tài liệu lên
              </Button>
            )}
          </>
        )}
      />

      {actionError && (
        <Alert tone="error" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{actionError}</span>
            <Button variant="secondary" size="sm" onClick={() => setActionError('')}>Đóng</Button>
          </div>
        </Alert>
      )}

      {/* Cảnh báo sắp hết hạn (HR/Admin) */}
      {canManage && expiring.length > 0 && (
        <Alert tone="warning" className="mb-5">
          <span className="font-medium">Có {expiring.length} giấy tờ đã hoặc sắp hết hạn trong 30 ngày: </span>
          {expiring.slice(0, 5).map((d, i) => (
            <span key={d.id}>
              {i > 0 ? '; ' : ''}
              {d.title} ({d.employee_name}) — {d.is_expired ? 'đã hết hạn' : `còn ${d.days_to_expiry} ngày`}
            </span>
          ))}
          {expiring.length > 5 ? `; và ${expiring.length - 5} giấy tờ khác.` : '.'}
        </Alert>
      )}

      {/* ============ KHU 1: HỒ SƠ NHÂN VIÊN ============ */}
      {showDocVault && (
        <>
      <h2 className="mb-3 text-base font-semibold text-gray-900">Hồ sơ nhân viên</h2>

      {role !== 'employee' && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="w-full max-w-xs">
            <FormField label="Nhân viên">
              <Select
                value={selectedEmployeeId}
                onChange={(e) => { setSelectedEmployeeId(e.target.value); setDocPage(1); }}
              >
                <option value="">Tất cả trong phạm vi của tôi</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name} ({e.code})</option>
                ))}
              </Select>
            </FormField>
          </div>
        </div>
      )}

      {docsError ? (
        <Alert tone="error" className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{docsError}</span>
            <Button variant="secondary" size="sm" onClick={loadDocuments}>Thử lại</Button>
          </div>
        </Alert>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-card">
          {docsLoading ? (
            <TableSkeleton />
          ) : documents.length === 0 ? (
            <EmptyState
              title="Chưa có tài liệu nào"
              description="Hồ sơ chưa có tài liệu nào trong phạm vi hiển thị hiện tại."
              action={canUpload ? <Button onClick={() => setUploadOpen(true)}>Tải tài liệu lên</Button> : undefined}
            />
          ) : (
            <table className="w-full text-sm">
              {tableHead(showEmployeeColumn)}
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-t border-gray-100 transition hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{doc.title}</div>
                      <div className="text-[13px] text-gray-500">{doc.original_filename}</div>
                      {doc.note && <div className="text-[13px] text-gray-400">{doc.note}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{docTypeLabel(doc.doc_type)}</td>
                    {showEmployeeColumn && (
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{doc.employee_name || '—'}</div>
                        <div className="text-[13px] text-gray-500">{doc.employee_code || ''}{doc.department_name ? ` · ${doc.department_name}` : ''}</div>
                      </td>
                    )}
                    <td className="px-4 py-3"><ExpiryCell doc={doc} /></td>
                    <td className="px-4 py-3 text-gray-700">{doc.uploaded_by_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => handleDownloadDoc(doc)}>
                          <IconDownload size={14} /> Tải xuống
                        </Button>
                        {canDelete && (
                          <button
                            type="button"
                            title="Xoá tài liệu"
                            aria-label="Xoá tài liệu"
                            onClick={() => setDeleteTarget(doc)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <IconTrash size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {docMeta && docMeta.totalPages > 1 && (
        <div className="-mt-4 mb-8 flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" disabled={docPage <= 1} onClick={() => setDocPage((p) => p - 1)}>Trước</Button>
          <span className="text-sm text-gray-500">Trang {docMeta.page}/{docMeta.totalPages}</span>
          <Button size="sm" variant="secondary" disabled={docPage >= docMeta.totalPages} onClick={() => setDocPage((p) => p + 1)}>Sau</Button>
        </div>
      )}
        </>
      )}

      {/* ============ KHU 2: GIẤY XÁC NHẬN ============ */}
      {(hasProfile || canManage) && (
        <>
      <h2 className="mb-3 text-base font-semibold text-gray-900">Giấy xác nhận</h2>

      {certsError ? (
        <Alert tone="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{certsError}</span>
            <Button variant="secondary" size="sm" onClick={loadCertificates}>Thử lại</Button>
          </div>
        </Alert>
      ) : certsLoading ? (
        <TableSkeleton />
      ) : (
        <div className="space-y-6">
          {/* Hàng chờ cấp — HR/Admin */}
          {canManage && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-card">
              <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-900">
                Hàng chờ cấp giấy ({certQueue.length})
              </div>
              {certQueue.length === 0 ? (
                <EmptyState title="Không có đơn chờ" description="Hiện không có yêu cầu giấy xác nhận nào đang chờ cấp." />
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Nhân viên</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Loại giấy</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Mục đích</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ngày xin</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certQueue.map((req) => (
                      <tr key={req.id} className="border-t border-gray-100 transition hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{req.employee_name || '—'}</div>
                          <div className="text-[13px] text-gray-500">{req.employee_code || ''}{req.department_name ? ` · ${req.department_name}` : ''}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{certTypeLabel(req.cert_type)}</td>
                        <td className="px-4 py-3 text-gray-700">{req.purpose}</td>
                        <td className="px-4 py-3 tabular-nums text-gray-700">{fmtDateTime(req.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" onClick={() => setDecisionTarget({ req, decision: 'approve' })}>Cấp phép</Button>
                            <Button size="sm" variant="secondary" onClick={() => setDecisionTarget({ req, decision: 'reject' })}>Từ chối</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Đơn của tôi — chỉ khi tài khoản đã gắn hồ sơ nhân viên */}
          {hasProfile && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-card">
            <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-900">Đơn xin giấy của tôi</div>
            {myCerts.length === 0 ? (
              <EmptyState
                title="Bạn chưa xin giấy nào"
                description="Bấm “Xin giấy xác nhận” để tạo yêu cầu giấy xác nhận lương hoặc công tác."
                action={<Button onClick={() => setCertFormOpen(true)}>Xin giấy xác nhận</Button>}
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Loại giấy</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Mục đích</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Trạng thái</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ngày xin</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {myCerts.map((req) => {
                    const meta = CERT_STATUS_META[req.status] || CERT_STATUS_META.pending;
                    return (
                      <tr key={req.id} className="border-t border-gray-100 transition hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{certTypeLabel(req.cert_type)}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {req.purpose}
                          {req.decision_note && <div className="text-[13px] text-gray-400">Ghi chú duyệt: {req.decision_note}</div>}
                        </td>
                        <td className="px-4 py-3"><Badge tone={meta.tone} dot>{meta.label}</Badge></td>
                        <td className="px-4 py-3 tabular-nums text-gray-700">{fmtDateTime(req.created_at)}</td>
                        <td className="px-4 py-3">
                          {req.status === 'approved' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button size="sm" variant="secondary" onClick={() => setPreview({ id: req.id, content: req.issued_content })}>
                                <IconEye size={14} /> Xem
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => downloadCertificate(req.id).catch((err) => setActionError(parseApiError(err, 'Không tải được file giấy xác nhận.').message))}>
                                <IconDownload size={14} /> Tải .txt
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          )}
        </div>
      )}
        </>
      )}

      {/* ============ MODALS ============ */}
      {uploadOpen && (
        <UploadModal
          employees={employees}
          canManage={canManage}
          defaultEmployeeId={selectedEmployeeId}
          onClose={() => setUploadOpen(false)}
          onDone={() => { setUploadOpen(false); loadDocuments(); loadExpiring(); }}
        />
      )}

      {certFormOpen && (
        <CertificateFormModal
          onClose={() => setCertFormOpen(false)}
          onDone={() => { setCertFormOpen(false); loadCertificates(); }}
        />
      )}

      {decisionTarget && (
        <DecisionModal
          target={decisionTarget}
          onClose={() => setDecisionTarget(null)}
          onConfirm={handleDecide}
        />
      )}

      {preview && (
        <Modal
          open
          title="Nội dung giấy xác nhận"
          subtitle="Văn bản đã cấp — tải file .txt để sử dụng."
          onClose={() => setPreview(null)}
          actions={(
            <>
              <Button variant="secondary" onClick={() => setPreview(null)}>Đóng</Button>
              <Button onClick={() => downloadCertificate(preview.id).catch((err) => setActionError(parseApiError(err, 'Không tải được file giấy xác nhận.').message))}>
                <IconDownload size={16} /> Tải file .txt
              </Button>
            </>
          )}
        >
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm leading-relaxed text-gray-800">{preview.content}</pre>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          open
          title="Xoá tài liệu?"
          subtitle={`Tài liệu “${deleteTarget.title}” và file đính kèm sẽ bị xoá khỏi hệ thống.`}
          onClose={() => setDeleteTarget(null)}
          actions={(
            <>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Huỷ</Button>
              <Button variant="danger" onClick={handleDeleteDoc}>Xoá tài liệu</Button>
            </>
          )}
        >
          <p className="text-sm text-gray-500">Thao tác này không thể hoàn tác.</p>
        </Modal>
      )}
    </div>
  );
}

// ---------- Modal tải tài liệu lên ----------

function UploadModal({ employees, canManage, defaultEmployeeId, onClose, onDone }) {
  const [form, setForm] = useState({
    employee_id: defaultEmployeeId || '',
    doc_type: 'contract',
    title: '',
    expiry_date: '',
    note: '',
  });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((p) => ({ ...p, [field]: undefined }));
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setErrors((p) => ({ ...p, file: undefined }));
    if (f) {
      const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
      if (BLOCKED_EXTS.includes(ext)) {
        setErrors((p) => ({ ...p, file: 'Định dạng file này bị chặn vì lý do an toàn.' }));
      } else if (f.size > MAX_FILE_BYTES) {
        setErrors((p) => ({ ...p, file: 'File vượt quá 10MB.' }));
      }
      if (!form.title) setForm((prev) => ({ ...prev, title: f.name.replace(/\.[^.]+$/, '') }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!file) nextErrors.file = 'Vui lòng chọn file.';
    if (canManage && !form.employee_id) nextErrors.employee_id = 'Vui lòng chọn nhân viên.';
    if (!form.title.trim()) nextErrors.title = 'Vui lòng nhập tiêu đề.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || errors.file) return;

    const data = new FormData();
    data.append('file', file);
    if (canManage) data.append('employee_id', form.employee_id);
    data.append('doc_type', form.doc_type);
    data.append('title', form.title.trim());
    if (form.expiry_date) data.append('expiry_date', form.expiry_date);
    if (form.note.trim()) data.append('note', form.note.trim());

    setSubmitting(true);
    setFormError('');
    try {
      await uploadDocument(data);
      onDone();
    } catch (err) {
      const parsed = parseApiError(err, 'Không tải lên được tài liệu.');
      setFormError(parsed.message);
      setErrors(parsed.fieldErrors || {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title="Tải tài liệu lên"
      subtitle="Tối đa 10MB; chặn các định dạng file thực thi nguy hiểm."
      onClose={onClose}
      actions={(
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="upload-doc-form" loading={submitting}>
            <IconPlus size={16} /> Tải lên
          </Button>
        </>
      )}
    >
      {formError && <Alert tone="error" className="mb-4">{formError}</Alert>}
      <form id="upload-doc-form" onSubmit={handleSubmit} className="space-y-4">
        {canManage && (
          <FormField label="Nhân viên" error={errors.employee_id}>
            <Select value={form.employee_id} onChange={set('employee_id')} error={errors.employee_id}>
              <option value="">— Chọn nhân viên —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.code})</option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField label="File tài liệu" error={errors.file}>
          <input
            type="file"
            onChange={handleFile}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-50"
          />
        </FormField>
        <FormField label="Loại tài liệu">
          <Select value={form.doc_type} onChange={set('doc_type')}>
            {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Tiêu đề" error={errors.title}>
          <Input value={form.title} onChange={set('title')} placeholder="VD: Hợp đồng lao động 2026" error={errors.title} />
        </FormField>
        <FormField label="Ngày hết hạn (nếu có)">
          <Input type="date" value={form.expiry_date} onChange={set('expiry_date')} />
        </FormField>
        <FormField label="Ghi chú">
          <Textarea value={form.note} onChange={set('note')} rows={2} placeholder="Ghi chú thêm (không bắt buộc)" />
        </FormField>
      </form>
    </Modal>
  );
}

// ---------- Modal xin giấy xác nhận ----------

function CertificateFormModal({ onClose, onDone }) {
  const [form, setForm] = useState({ cert_type: 'salary', purpose: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.purpose.trim()) {
      setErrors({ purpose: 'Vui lòng nhập mục đích xin giấy.' });
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await createCertificate({ cert_type: form.cert_type, purpose: form.purpose.trim() });
      onDone();
    } catch (err) {
      const parsed = parseApiError(err, 'Không gửi được yêu cầu.');
      setFormError(parsed.message);
      setErrors(parsed.fieldErrors || {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title="Xin giấy xác nhận"
      subtitle="HR/Admin sẽ xét cấp giấy; khi được cấp bạn có thể tải file .txt tại đây."
      onClose={onClose}
      actions={(
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="cert-form" loading={submitting}>Gửi yêu cầu</Button>
        </>
      )}
    >
      {formError && <Alert tone="error" className="mb-4">{formError}</Alert>}
      <form id="cert-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Loại giấy">
          <Select value={form.cert_type} onChange={(e) => setForm((f) => ({ ...f, cert_type: e.target.value }))}>
            {CERT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Mục đích" error={errors.purpose}>
          <Textarea
            value={form.purpose}
            onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
            rows={3}
            placeholder="VD: Bổ sung hồ sơ vay ngân hàng, làm thủ tục visa..."
            error={errors.purpose}
          />
        </FormField>
      </form>
    </Modal>
  );
}

// ---------- Modal quyết định cấp giấy (HR/Admin) ----------

function DecisionModal({ target, onClose, onConfirm }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isApprove = target.decision === 'approve';

  const handleConfirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(note.trim());
    } catch (err) {
      setError(parseApiError(err, 'Không thực hiện được quyết định.').message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={isApprove ? 'Cấp giấy xác nhận' : 'Từ chối cấp giấy'}
      subtitle={`${certTypeLabel(target.req.cert_type)} cho ${target.req.employee_name || 'nhân viên'} — ${target.req.purpose}`}
      onClose={onClose}
      actions={(
        <>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button variant={isApprove ? 'primary' : 'danger'} onClick={handleConfirm} loading={submitting}>
            {isApprove ? 'Cấp phép' : 'Từ chối'}
          </Button>
        </>
      )}
    >
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {isApprove && (
        <p className="mb-4 text-sm text-gray-500">
          Hệ thống sẽ sinh nội dung giấy xác nhận từ hồ sơ nhân viên và bạn có thể xem trước ngay sau khi cấp.
        </p>
      )}
      <FormField label="Ghi chú quyết định (không bắt buộc)">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ghi chú cho nhân viên..." />
      </FormField>
    </Modal>
  );
}
