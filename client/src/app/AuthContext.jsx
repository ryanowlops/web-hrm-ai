import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/index.js';
import { clearTokens, getAccessToken, saveTokens } from '../api/axiosClient.js';

// user: { id, email, fullName, role: 'admin' | 'hr' | 'manager' | 'employee',
//         employeeId } hoặc null khi chưa đăng nhập.
const AuthContext = createContext({
  user: null,
  loading: true,
  isAuthenticated: false,
  login: async () => null,
  logout: async () => {},
  refreshUser: async () => null,
});

function normalizeUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id ?? raw.user_id ?? raw.sub ?? null,
    email: raw.email ?? null,
    fullName: raw.full_name ?? raw.fullName ?? raw.name ?? null,
    role: raw.role ?? null,
    employeeId: raw.employee_id ?? raw.employeeId ?? null,
  };
}

// Dự phòng khi /users/me lỗi: giải mã payload JWT (không kiểm tra chữ ký —
// chỉ để hiển thị giao diện; quyền thật luôn do backend quyết định).
function decodeUserFromToken(token) {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return normalizeUser(JSON.parse(json));
  } catch {
    return null;
  }
}

function extractAuthResult(payload) {
  const body = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  const source = body || {};
  return {
    accessToken: source.access_token || source.accessToken || null,
    refreshToken: source.refresh_token || source.refreshToken || null,
    user: normalizeUser(source.user || source),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      return null;
    }
    try {
      const me = await authApi.me();
      const normalized = normalizeUser(me?.data ?? me);
      setUser(normalized);
      return normalized;
    } catch {
      const fallback = decodeUserFromToken(token);
      setUser(fallback);
      return fallback;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshUser();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const login = useCallback(
    async (email, password) => {
      const result = await authApi.login(email, password);
      const { accessToken, refreshToken, user: userFromLogin } = extractAuthResult(result);
      if (accessToken) saveTokens({ accessToken, refreshToken });
      if (userFromLogin && userFromLogin.role) {
        setUser(userFromLogin);
        return userFromLogin;
      }
      // Response đăng nhập không kèm user: lấy lại hồ sơ hiện tại.
      return refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Bỏ qua lỗi mạng/không còn phiên: vẫn phải xóa phiên ở client.
    }
    clearTokens();
    // Xoá cache truy vấn đã lưu (main.jsx) để tài khoản sau trên cùng
    // trình duyệt không thấy dữ liệu của người trước khi nạp lại trang.
    try {
      window.localStorage.removeItem('hrm-rq-cache-v1');
    } catch {
      // localStorage không khả dụng (private mode...) — bỏ qua.
    }
    setUser(null);
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshUser,
    }),
    [user, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
