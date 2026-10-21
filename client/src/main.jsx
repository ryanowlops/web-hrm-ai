import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './app/AuthContext.jsx';
import router from './app/router.jsx';

// Font Inter (đóng gói sẵn, không phụ thuộc CDN)
import '@fontsource-variable/inter';
// Font tiêu đề v3 — Be Vietnam Pro (đóng gói local, weight 600/700/800)
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';

// Design system v3 ("Nhịp nhân sự"): Tailwind → tokens → base → animations → motion
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
