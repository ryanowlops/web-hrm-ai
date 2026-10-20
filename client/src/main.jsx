import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './app/AuthContext.jsx';
import router from './app/router.jsx';

// Design system (ui-ux-pro-max): thứ tự nạp tokens → base → components → animations
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/animations.css';

// LƯU Ý cho worker design-system: nếu có file style toàn cục (src/index.css),
// hãy thêm dòng import './index.css'; vào đây. Nền tảng này cố ý không import
// CSS nào ngoài phần nền tối thiểu đã đặt inline trong index.html.

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
