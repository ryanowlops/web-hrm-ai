import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './app/AuthContext.jsx';
import router from './app/router.jsx';
import { ToastProvider } from './components/ui';

// Tự chữa lỗi chunk cũ sau khi deploy bản mới: Vite bắn sự kiện
// 'vite:preloadError' khi import động trúng chunk đã bị thay/thế xoá —
// tải lại trang để lấy bản mới thay vì để app đứng ở trạng thái lỗi.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

// Font Inter Variable (đóng gói sẵn, không phụ thuộc CDN) — font duy nhất cho toàn bộ giao diện v4
import '@fontsource-variable/inter';

// Design system v4: Tailwind → tokens → base → animations → motion
import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/animations.css';
import './styles/motion.css';

// TanStack Query giữ toàn bộ dữ liệu server (danh sách, chi tiết, thống kê).
// State toàn cục của app chỉ gồm phiên đăng nhập (AuthContext).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Đợt tối ưu tốc độ 2026-10-23: lưu cache truy vấn xuống localStorage để
// NẠP LẠI TRANG (F5) vẽ ngay dữ liệu gần nhất thay vì chờ backend free
// (~0,5–1s mỗi request). Dữ liệu vẫn được revalidate ở nền theo
// staleTime; bản lưu tự hết hạn sau 10 phút và bị xoá khi đăng xuất
// (AuthContext.logout). Chỉ lưu các query thành công.
export const RQ_CACHE_KEY = 'hrm-rq-cache-v1';
const queryPersister = createAsyncStoragePersister({
  storage: window.localStorage,
  key: RQ_CACHE_KEY,
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 10 * 60 * 1000,
        buster: 'perf-2026-10-23',
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.state.status === 'success',
        },
      }}
    >
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
