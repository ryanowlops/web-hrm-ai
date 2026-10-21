// Trang Bản đồ năng lực — route /skills (feature-expansion-v5 mục D.3)
// 3 tab:
// - Bản đồ công ty: bảng nhiệt kỹ năng × phòng ban (mức trung bình + số
//   người), bấm vào ô để xem danh sách nhân viên của phòng ban đó.
// - Kỹ năng của tôi: tự cập nhật mức 1–5, biểu đồ radar (recharts nạp
//   lười qua DeferredMount như Dashboard/Reports), gợi ý khoá học AI.
// - Quản trị (chỉ hr/admin): CRUD danh mục kỹ năng.
// Trình bày phẳng theo hợp đồng thiết kế v4 + UI kit dùng chung.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/AuthContext.jsx';
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
import DeferredMount from '../../../components/motion/DeferredMount.jsx';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconSparkles,
  IconCheck,
} from '../../../components/icons.jsx';
import {
  getSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  getMatrix,
  getMatrixCell,
  getEmployeeSkills,
  updateEmployeeSkills,
  suggestCourses,
  parseApiError,
} from '../services';

const SkillRadar = lazy(() => import('../components/SkillRadar.jsx'));

const CATEGORIES = ['Kỹ thuật', 'Chuyên môn', 'Mềm', 'Ngoại ngữ', 'Khác'];
const LEVELS = [1, 2, 3, 4, 5];
const LEVEL_LABELS = {
  1: 'Mới bắt đầu',
  2: 'Cơ bản',
  3: 'Khá',
  4: 'Tốt',
  5: 'Chuyên gia',
};
const CATEGORY_TONES = {
  'Kỹ thuật': 'blue',
  'Chuyên môn': 'violet',
  Mềm: 'teal',
  'Ngoại ngữ': 'amber',
  Khác: 'slate',
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

// Màu ô nhiệt: xanh brand đậm dần theo mức trung bình 1..5.
function heatCellStyle(avg) {
  if (avg == null) return undefined;
  const alpha = 0.1 + (Math.min(5, Math.max(1, avg)) / 5) * 0.72;
  return {
    backgroundColor: `rgba(39, 79, 234, ${alpha.toFixed(2)})`,
    color: avg >= 3.4 ? '#FFFFFF' : '#1D2939',
  };
}

// ===========================================================================
// Tab 1 — Bản đồ công ty (bảng nhiệt)
// ===========================================================================

function CompanyMapTab() {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // { skill, department }
  const [cell, setCell] = useState(null);
  const [cellLoading, setCellLoading] = useState(false);
  const [cellError, setCellError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMatrix();
      setMatrix(data);
    } catch (err) {
      setError(parseApiError(err, 'Không tải được bản đồ năng lực.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCell = async (skill, department) => {
    setSelected({ skill, department });
    setCell(null);
    setCellError('');
    setCellLoading(true);
    try {
      const data = await getMatrixCell(skill.id, department.id);
      setCell(data);
    } catch (err) {
      setCellError(parseApiError(err, 'Không tải được chi tiết ô.').message);
    } finally {
      setCellLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardBody>
          <TableSkeleton rows={6} cols={5} />
        </CardBody>
      </Card>
    );
  }
  if (error) {
    return (
      <div>
        <Alert tone="error" className="mb-4">{error}</Alert>
        <Button variant="secondary" onClick={load}>Thử lại</Button>
      </div>
    );
  }
  if (!matrix || !matrix.rows?.length) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            title="Chưa có dữ liệu năng lực"
            description="Danh mục kỹ năng đang trống hoặc chưa có nhân viên nào được đánh giá. HR có thể tạo kỹ năng ở tab Quản trị."
          />
        </CardBody>
      </Card>
    );
  }

  const departments = matrix.departments || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Ma trận kỹ năng toàn công ty"
          subtitle="Mỗi ô: mức trung bình (thang 5) · số người có kỹ năng. Ô trống nghĩa là phòng ban chưa có ai sở hữu kỹ năng này."
        />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-3 py-2.5 text-left font-medium text-gray-500">
                  Kỹ năng
                </th>
                {departments.map((dept) => (
                  <th
                    key={dept.id}
                    className="border-b border-gray-200 px-3 py-2.5 text-center font-medium text-gray-500"
                  >
                    {dept.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map(({ skill, cells }) => (
                <tr key={skill.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900">{skill.name}</div>
                    {skill.category && (
                      <Badge tone={CATEGORY_TONES[skill.category] || 'slate'} className="mt-1">
                        {skill.category}
                      </Badge>
                    )}
                  </td>
                  {departments.map((dept) => {
                    const cellData = cells?.[String(dept.id)] ?? null;
                    const isSelected =
                      selected?.skill.id === skill.id && selected?.department.id === dept.id;
                    if (!cellData) {
                      return (
                        <td key={dept.id} className="px-2 py-2.5 text-center text-gray-300">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={dept.id} className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => openCell(skill, dept)}
                          style={heatCellStyle(cellData.avg_level)}
                          title={`${skill.name} tại ${dept.name}: mức TB ${cellData.avg_level}/5, ${cellData.headcount} người — bấm để xem chi tiết`}
                          className={`w-full rounded-lg px-2 py-2 text-center transition duration-150 hover:ring-2 hover:ring-brand-600/40 ${
                            isSelected ? 'ring-2 ring-brand-600' : ''
                          }`}
                        >
                          <span className="block text-base font-semibold leading-5">
                            {Number(cellData.avg_level).toFixed(1)}
                          </span>
                          <span className="block text-xs opacity-80">
                            {cellData.headcount} người
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <span>Yếu</span>
            {[1, 2, 3, 4, 5].map((lv) => (
              <span
                key={lv}
                className="h-3.5 w-7 rounded"
                style={heatCellStyle(lv)}
              />
            ))}
            <span>Mạnh</span>
          </div>
        </CardBody>
      </Card>

      {selected && (
        <Card>
          <CardHeader
            title={`${selected.skill.name} — ${selected.department.name}`}
            subtitle="Nhân viên của phòng ban sở hữu kỹ năng này, xếp theo mức giảm dần."
          />
          <CardBody>
            {cellLoading && <TableSkeleton rows={3} cols={3} />}
            {cellError && <Alert tone="error">{cellError}</Alert>}
            {cell && !cellLoading && (
              cell.employees?.length ? (
                <ul className="divide-y divide-gray-100">
                  {cell.employees.map((emp) => (
                    <li key={emp.employee_id} className="flex items-center justify-between py-2.5">
                      <div>
                        <span className="font-medium text-gray-900">{emp.employee_name}</span>
                        <span className="ml-2 text-sm text-gray-500">{emp.employee_code}</span>
                      </div>
                      <Badge tone={emp.level >= 4 ? 'green' : emp.level === 3 ? 'blue' : 'amber'}>
                        Mức {emp.level}/5 — {LEVEL_LABELS[emp.level]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Chưa có nhân viên nào" description="Phòng ban này chưa có ai sở hữu kỹ năng đã chọn." />
              )
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ===========================================================================
// Tab 2 — Kỹ năng của tôi
// ===========================================================================

function LevelPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Chọn mức kỹ năng">
      {LEVELS.map((lv) => {
        const active = value === lv;
        return (
          <button
            key={lv}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${lv} — ${LEVEL_LABELS[lv]}`}
            onClick={() => onChange(lv)}
            className={`h-9 w-9 rounded-lg border text-sm font-medium transition duration-150 ${
              active
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-gray-300 bg-white text-gray-600 hover:border-brand-600 hover:text-brand-700'
            }`}
          >
            {lv}
          </button>
        );
      })}
    </div>
  );
}

function MySkillsTab({ employeeId }) {
  const [catalog, setCatalog] = useState([]);
  const [levels, setLevels] = useState({}); // skillId -> level | null (đang sửa)
  const [savedLevels, setSavedLevels] = useState({}); // skillId -> level (đã lưu)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestSource, setSuggestSource] = useState('keyword');
  const [suggestError, setSuggestError] = useState('');

  const load = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [skillsRes, profile] = await Promise.all([
        getSkills(),
        getEmployeeSkills(employeeId),
      ]);
      setCatalog(skillsRes.items || []);
      const mine = {};
      (profile?.items || []).forEach((item) => {
        mine[item.skill_id] = item.level;
      });
      setSavedLevels(mine);
      setLevels(mine);
    } catch (err) {
      setError(parseApiError(err, 'Không tải được hồ sơ kỹ năng.').message);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const dirtyItems = useMemo(() => {
    const items = [];
    Object.entries(levels).forEach(([skillId, level]) => {
      if (level != null && savedLevels[skillId] !== level) {
        items.push({ skill_id: Number(skillId), level });
      }
    });
    return items;
  }, [levels, savedLevels]);

  const radarData = useMemo(
    () =>
      catalog
        .filter((s) => savedLevels[s.id] != null)
        .map((s) => ({ skill: s.name, level: savedLevels[s.id] })),
    [catalog, savedLevels],
  );

  const handleSave = async () => {
    if (!dirtyItems.length) return;
    setSaving(true);
    setSaveMsg('');
    setError('');
    try {
      await updateEmployeeSkills(employeeId, dirtyItems);
      const next = { ...savedLevels };
      dirtyItems.forEach((item) => {
        next[item.skill_id] = item.level;
      });
      setSavedLevels(next);
      setSaveMsg('Đã lưu mức kỹ năng của bạn.');
    } catch (err) {
      setError(parseApiError(err, 'Không lưu được mức kỹ năng.').message);
    } finally {
      setSaving(false);
    }
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestError('');
    try {
      const { items, source } = await suggestCourses(employeeId);
      setSuggestions(items);
      setSuggestSource(source);
    } catch (err) {
      setSuggestError(parseApiError(err, 'Không lấy được gợi ý khoá học.').message);
    } finally {
      setSuggesting(false);
    }
  };

  if (!employeeId) {
    return (
      <Alert tone="error">
        Tài khoản của bạn chưa được gắn với hồ sơ nhân viên nên chưa có hồ sơ kỹ năng.
      </Alert>
    );
  }
  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3"><Skeleton className="h-96 w-full" /></div>
        <div className="lg:col-span-2"><Skeleton className="h-96 w-full" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {saveMsg && <Alert tone="success">{saveMsg}</Alert>}
      <div className="grid items-start gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Mức kỹ năng của tôi"
            subtitle="Chạm vào số 1–5 để tự đánh giá từng kỹ năng, rồi bấm Lưu thay đổi."
            actions={
              <Button onClick={handleSave} loading={saving} disabled={!dirtyItems.length}>
                <IconCheck size={16} /> Lưu thay đổi
              </Button>
            }
          />
          <CardBody>
            {catalog.length === 0 ? (
              <EmptyState title="Chưa có kỹ năng nào trong danh mục" description="HR chưa tạo danh mục kỹ năng. Vui lòng quay lại sau." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {catalog.map((skill) => {
                  const value = levels[skill.id] ?? null;
                  return (
                    <li key={skill.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{skill.name}</span>
                          {skill.category && (
                            <Badge tone={CATEGORY_TONES[skill.category] || 'slate'}>{skill.category}</Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-sm text-gray-500">
                          {value != null ? `Mức ${value}/5 — ${LEVEL_LABELS[value]}` : 'Chưa đánh giá'}
                        </div>
                      </div>
                      <LevelPicker
                        value={value}
                        onChange={(lv) => setLevels((prev) => ({ ...prev, [skill.id]: lv }))}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Hồ sơ năng lực" subtitle="Biểu đồ radar theo mức đã lưu." />
            <CardBody>
              {radarData.length >= 3 ? (
                <DeferredMount fallback={<Skeleton className="h-[320px] w-full" />}>
                  <Suspense fallback={<Skeleton className="h-[320px] w-full" />}>
                    <SkillRadar data={radarData} />
                  </Suspense>
                </DeferredMount>
              ) : (
                <EmptyState
                  title="Chưa đủ dữ liệu vẽ radar"
                  description="Hãy đánh giá ít nhất 3 kỹ năng để xem biểu đồ năng lực của bạn."
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Lấp khoảng trống kỹ năng"
              subtitle="Khoá học gợi ý cho các kỹ năng đang dưới mức 3."
              actions={
                <Button size="sm" variant="secondary" onClick={handleSuggest} loading={suggesting}>
                  <IconSparkles size={16} /> Gợi ý khoá học cho tôi
                </Button>
              }
            />
            <CardBody>
              {suggestError && <Alert tone="error">{suggestError}</Alert>}
              {suggestions === null && !suggestError && (
                <p className="text-sm leading-relaxed text-gray-500">
                  Bấm nút gợi ý để hệ thống đối chiếu kỹ năng yếu của bạn với danh sách khoá học đang mở.
                </p>
              )}
              {suggestions !== null && suggestions.length === 0 && (
                <EmptyState
                  title="Không có khoảng trống nào"
                  description="Mọi kỹ năng của bạn đều từ mức 3 trở lên, hoặc chưa có khoá học khớp. Tốt lắm!"
                />
              )}
              {suggestions !== null && suggestions.length > 0 && (
                <div className="space-y-3">
                  <div>
                    {suggestSource === 'ai' ? (
                      <Badge tone="blue" dot>Xếp hạng bởi AI</Badge>
                    ) : (
                      <Badge tone="slate" dot>Khớp theo từ khoá</Badge>
                    )}
                  </div>
                  <ul className="space-y-3">
                    {suggestions.map((sug, idx) => (
                      <li key={`${sug.course.id}-${sug.skill}-${idx}`} className="rounded-lg border border-gray-200 p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link to="/training" className="font-medium text-brand-700 hover:underline">
                            {sug.course.title}
                          </Link>
                          <Badge tone="amber">
                            {sug.skill} · mức {sug.current_level}/5
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{sug.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 3 — Quản trị danh mục (hr/admin)
// ===========================================================================

function AdminTab() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', skill? }
  const [form, setForm] = useState({ name: '', category: 'Kỹ thuật', description: '' });
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null); // skill đang chờ xác nhận xoá
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { items } = await getSkills();
      setSkills(items || []);
    } catch (err) {
      setError(parseApiError(err, 'Không tải được danh mục kỹ năng.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({ name: '', category: 'Kỹ thuật', description: '' });
    setFormError('');
    setFieldErrors({});
    setModal({ mode: 'create' });
  };

  const openEdit = (skill) => {
    setForm({
      name: skill.name || '',
      category: skill.category || 'Khác',
      description: skill.description || '',
    });
    setFormError('');
    setFieldErrors({});
    setModal({ mode: 'edit', skill });
  };

  const handleSubmit = async () => {
    setSaving(true);
    setFormError('');
    setFieldErrors({});
    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim() || null,
    };
    try {
      if (modal.mode === 'create') {
        await createSkill(payload);
      } else {
        await updateSkill(modal.skill.id, payload);
      }
      setModal(null);
      await load();
    } catch (err) {
      const parsed = parseApiError(err, 'Không lưu được kỹ năng.');
      setFormError(parsed.message);
      setFieldErrors(parsed.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setDeleteError('');
    try {
      await deleteSkill(deleting.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleteError(parseApiError(err, 'Không xoá được kỹ năng.').message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <IconPlus size={16} /> Thêm kỹ năng
        </Button>
      </div>
      {error && (
        <div>
          <Alert tone="error" className="mb-3">{error}</Alert>
          <Button variant="secondary" onClick={load}>Thử lại</Button>
        </div>
      )}
      <Card>
        <CardBody>
          {loading ? (
            <TableSkeleton rows={6} cols={4} />
          ) : skills.length === 0 ? (
            <EmptyState title="Chưa có kỹ năng nào" description="Bấm Thêm kỹ năng để bắt đầu xây danh mục năng lực của công ty." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="px-3 py-2.5 font-medium">Kỹ năng</th>
                    <th className="px-3 py-2.5 font-medium">Nhóm</th>
                    <th className="px-3 py-2.5 font-medium">Mô tả</th>
                    <th className="px-3 py-2.5 text-center font-medium">Số người có</th>
                    <th className="px-3 py-2.5 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((skill) => (
                    <tr key={skill.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-3 font-medium text-gray-900">{skill.name}</td>
                      <td className="px-3 py-3">
                        {skill.category ? (
                          <Badge tone={CATEGORY_TONES[skill.category] || 'slate'}>{skill.category}</Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="max-w-[320px] px-3 py-3 text-gray-600">
                        <span className="line-clamp-2">{skill.description || '—'}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700">{skill.holder_count ?? 0}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <GhostIconButton label="Sửa" onClick={() => openEdit(skill)} />
                          <GhostIconButton label="Xoá" danger onClick={() => { setDeleteError(''); setDeleting(skill); }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={Boolean(modal)}
        title={modal?.mode === 'create' ? 'Thêm kỹ năng' : 'Sửa kỹ năng'}
        subtitle="Kỹ năng sẽ xuất hiện trong bản đồ năng lực và hồ sơ của mọi nhân viên."
        onClose={() => setModal(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Huỷ</Button>
            <Button onClick={handleSubmit} loading={saving}>Lưu kỹ năng</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <FormField label="Tên kỹ năng" error={fieldErrors.name}>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="VD: Python"
              error={Boolean(fieldErrors.name)}
            />
          </FormField>
          <FormField label="Nhóm kỹ năng" error={fieldErrors.category}>
            <Select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Mô tả" error={fieldErrors.description}>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả ngắn về kỹ năng và phạm vi áp dụng…"
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        title="Xoá kỹ năng?"
        subtitle={deleting ? `Kỹ năng "${deleting.name}" và toàn bộ mức đánh giá gắn với nó sẽ bị xoá khỏi hồ sơ nhân viên.` : ''}
        onClose={() => setDeleting(null)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Huỷ</Button>
            <Button variant="danger" onClick={handleDelete} loading={saving}>Xoá kỹ năng</Button>
          </>
        }
      >
        {deleteError && <Alert tone="error">{deleteError}</Alert>}
        <p className="text-sm leading-relaxed text-gray-600">
          Hành động này không thể hoàn tác. Bản đồ năng lực sẽ được tính lại ngay sau khi xoá.
        </p>
      </Modal>
    </div>
  );
}

// ===========================================================================
// Trang chính
// ===========================================================================

export default function SkillsPage() {
  const { user } = useAuth();
  const role = user?.role || getRoleFallback();
  const isAdmin = role === 'hr' || role === 'admin';
  const [tab, setTab] = useState('map');

  const tabs = [
    { id: 'map', label: 'Bản đồ công ty' },
    { id: 'mine', label: 'Kỹ năng của tôi' },
    ...(isAdmin ? [{ id: 'admin', label: 'Quản trị' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Bản đồ năng lực"
        subtitle="Toàn cảnh kỹ năng của công ty theo phòng ban, hồ sơ năng lực cá nhân và gợi ý đào tạo lấp khoảng trống."
      />
      <div className="mb-5 flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition duration-150 ${
              tab === t.id
                ? 'border-brand-600 font-medium text-brand-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'map' && <CompanyMapTab />}
      {tab === 'mine' && <MySkillsTab employeeId={user?.employeeId ?? null} />}
      {tab === 'admin' && isAdmin && <AdminTab />}
    </div>
  );
}
