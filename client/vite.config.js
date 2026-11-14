import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: React chạy cổng 5173, mọi request /api được proxy sang Flask (cổng 5000)
// nên frontend luôn gọi đường dẫn tương đối /api/v1, không hard-code host backend.
// Build: chia chunk theo vendor để trình duyệt cache dài hạn phần thư viện,
// trang nào dùng thư viện nào mới tải chunk đó (code-splitting theo route ở router.jsx).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-charts': ['recharts'],
          'vendor-http': ['axios'],
          // Tách shell Astryx + motion + icons ra chunk riêng: các chunk này
          // gần như không đổi giữa các lần deploy nên trình duyệt cache dài
          // hạn, lần sau chỉ tải lại chunk app nhỏ (index) thay vì cả 945KB.
          'vendor-astryx': [
            '@astryxdesign/core',
            '@astryxdesign/theme-neutral',
            '@stylexjs/stylex',
          ],
          'vendor-motion': ['motion'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
