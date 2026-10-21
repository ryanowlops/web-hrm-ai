// ============================================================
// Màn hình sảnh (chế độ TV) — route "/display" — mở rộng v5 mục C.
// - Toàn màn hình nền navy #0B1B3A (NGOẠI LỆ nền tối, chỉ trang này),
//   chữ lớn cho khoảng cách xem xa, tương phản cao.
// - Tự luân chuyển 4 cảnh, mỗi cảnh 12 giây, có thanh tiến trình:
//   Vinh danh -> Cột mốc -> Thông báo -> Nhịp công ty.
// - Di chuột vào màn hình: TẠM DỪNG luân chuyển; phím Esc: về Dashboard.
// - Dữ liệu chỉ từ endpoint sẵn có (engagement/gamification/announcements/
//   stats/feed) qua features/display/services; refetch mỗi 60 giây để
//   treo lâu vẫn mới. Cảnh lỗi/thiếu dữ liệu tự hiển thị trạng thái
//   chào rỗng, không làm sập vòng quay.
// - Bấm vào màn hình: thử bật toàn màn hình (cho TV) — trình duyệt chỉ
//   cho phép sau thao tác của người dùng, lỗi thì bỏ qua lặng lẽ.
// Đăng ký route do parent làm (ngoài AppLayout, trong vùng đã đăng nhập).
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  SceneAnnouncements,
  SceneCelebration,
  SceneMilestones,
  ScenePulse,
} from '../components/DisplayScenes.jsx';
import {
  getDisplayActivity,
  getDisplayAnnouncements,
  getDisplayKudos,
  getDisplayLeaderboard,
  getDisplayMilestones,
  getDisplayOverview,
} from '../services';

const SCENE_DURATION_MS = 12_000;
const TICK_MS = 100;

const SCENES = [
  { key: 'celebration', label: 'Vinh danh' },
  { key: 'milestones', label: 'Cột mốc' },
  { key: 'announcements', label: 'Thông báo' },
  { key: 'pulse', label: 'Nhịp công ty' },
];

const timeFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const displayQueryOptions = {
  refetchInterval: 60_000,
  staleTime: 30_000,
  retry: 1,
};

export default function DisplayPage() {
  const navigate = useNavigate();
  const [sceneIndex, setSceneIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const fullscreenTriedRef = useRef(false);

  const now = useClock();

  const kudosQuery = useQuery({
    queryKey: ['display', 'kudos'],
    queryFn: getDisplayKudos,
    ...displayQueryOptions,
  });
  const leaderboardQuery = useQuery({
    queryKey: ['display', 'leaderboard'],
    queryFn: getDisplayLeaderboard,
    ...displayQueryOptions,
  });
  const milestonesQuery = useQuery({
    queryKey: ['display', 'milestones'],
    queryFn: getDisplayMilestones,
    ...displayQueryOptions,
  });
  const announcementsQuery = useQuery({
    queryKey: ['display', 'announcements'],
    queryFn: getDisplayAnnouncements,
    ...displayQueryOptions,
  });
  const overviewQuery = useQuery({
    queryKey: ['display', 'overview'],
    queryFn: getDisplayOverview,
    ...displayQueryOptions,
  });
  const activityQuery = useQuery({
    queryKey: ['display', 'activity'],
    queryFn: getDisplayActivity,
    ...displayQueryOptions,
  });

  // Vòng luân chuyển: tích lũy thời gian theo tick 100ms, đứng yên khi
  // đang tạm dừng (hover). Đủ 12 giây -> cảnh kế tiếp.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!pausedRef.current) {
        setElapsedMs((prev) => prev + TICK_MS);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (elapsedMs >= SCENE_DURATION_MS) {
      setSceneIndex((prev) => (prev + 1) % SCENES.length);
      setElapsedMs(0);
    }
  }, [elapsedMs]);

  // Esc -> quay về Dashboard (route "/").
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  const goToScene = (index) => {
    setSceneIndex(index);
    setElapsedMs(0);
  };

  const tryFullscreen = () => {
    if (fullscreenTriedRef.current || document.fullscreenElement) return;
    fullscreenTriedRef.current = true;
    try {
      const result = document.documentElement.requestFullscreen?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Trình duyệt chặn toàn màn hình — bỏ qua, trang vẫn chạy thường.
    }
  };

  const progress = Math.min(1, elapsedMs / SCENE_DURATION_MS);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-hidden bg-[#0B1B3A] text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={tryFullscreen}
    >
      {/* Điểm nhấn trang trí tĩnh: hai quầng sáng brand rất mờ ở góc */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-[#274FEA] opacity-20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-56 -left-40 h-[520px] w-[520px] rounded-full bg-[#274FEA] opacity-10 blur-3xl"
      />

      <div className="relative flex h-full flex-col px-14 py-9">
        {/* Đầu trang: logo + tên công ty | đồng hồ ICT */}
        <header className="flex items-start justify-between gap-8">
          <div className="flex items-center gap-5">
            <img src="/logo.svg" alt="Logo Web HRM AI" className="h-16 w-16 rounded-2xl bg-white p-2" />
            <div>
              <p className="text-[32px] font-bold leading-tight">Web HRM AI</p>
              <p className="text-base text-white/55">Hệ thống quản lý nhân sự · Màn hình sảnh</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-5xl font-bold tabular-nums leading-none tracking-tight">
              {timeFmt.format(now)}
            </p>
            <p className="mt-2 text-lg text-white/60">{capitalize(dateFmt.format(now))}</p>
          </div>
        </header>

        {/* Thân: cảnh hiện tại (key đổi -> chạy animation vào cảnh) */}
        <main key={sceneIndex} className="display-scene-enter mt-10 min-h-0 flex-1">
          {sceneIndex === 0 && (
            <SceneCelebration kudosQuery={kudosQuery} leaderboardQuery={leaderboardQuery} />
          )}
          {sceneIndex === 1 && <SceneMilestones milestonesQuery={milestonesQuery} />}
          {sceneIndex === 2 && <SceneAnnouncements announcementsQuery={announcementsQuery} />}
          {sceneIndex === 3 && (
            <ScenePulse overviewQuery={overviewQuery} activityQuery={activityQuery} />
          )}
        </main>

        {/* Chân: tiến trình luân chuyển + gợi ý thao tác */}
        <footer className="mt-8 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3" role="tablist" aria-label="Cảnh đang chiếu">
            {SCENES.map((scene, idx) => (
              <button
                key={scene.key}
                type="button"
                role="tab"
                aria-selected={idx === sceneIndex}
                aria-label={`Chuyển tới cảnh ${scene.label}`}
                onClick={() => goToScene(idx)}
                className={`relative h-2.5 overflow-hidden rounded-full transition-all duration-500 ${
                  idx === sceneIndex ? 'w-24 bg-white/15' : 'w-10 bg-white/15 hover:bg-white/25'
                }`}
              >
                {idx === sceneIndex ? (
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-[#9DB8FF]"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                ) : idx < sceneIndex ? (
                  <span className="absolute inset-0 rounded-full bg-[#9DB8FF]/50" />
                ) : null}
              </button>
            ))}
            <span className="ml-3 text-base font-medium text-white/70">
              {SCENES[sceneIndex].label}
            </span>
          </div>
          <p className="text-sm text-white/40">
            {paused
              ? 'Đã tạm dừng — di chuột ra ngoài để tiếp tục'
              : 'Di chuột để tạm dừng · Bấm vào màn hình để bật toàn màn hình · Esc để thoát'}
          </p>
        </footer>
      </div>

      {/* Animation chuyển cảnh: chỉ transform/opacity (mượt trên TV) */}
      <style>{`
        @keyframes display-scene-in {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .display-scene-enter { animation: display-scene-in 600ms ease-out both; }
      `}</style>
    </div>
  );
}
