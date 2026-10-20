import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/AuthContext.jsx';
import { login } from '../services';

// ============================================================
// Trang đăng nhập — route /login
// - Form email / mật khẩu, báo lỗi tiếng Việt ngay tại trường.
// - Đăng nhập thành công: services.login lưu token vào localStorage
//   (hrm_access_token / hrm_refresh_token), sau đó refreshUser() đồng bộ
//   trạng thái vào AuthContext (ProtectedRoute dựa vào context này)
//   rồi mới chuyển về "/" (hoặc trang trước đó nếu bị route bảo vệ chặn).
// ============================================================

// Thông báo thân thiện theo mã lỗi của API (không dựa vào message của server).
const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.',
  UNAUTHORIZED: 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị khóa. Vui lòng liên hệ phòng nhân sự (HR).',
  ACCOUNT_LOCKED: 'Tài khoản đã bị khóa tạm thời. Vui lòng liên hệ phòng nhân sự (HR).',
  TOO_MANY_REQUESTS: 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.',
  VALIDATION_ERROR: 'Thông tin đăng nhập chưa hợp lệ. Vui lòng kiểm tra lại các trường bên dưới.',
  NETWORK_ERROR: 'Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng và thử lại.',
  SERVER_ERROR: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.',
};

function validateForm({ email, password }) {
  const errors = {};
  const emailValue = email.trim();
  if (!emailValue) {
    errors.email = 'Vui lòng nhập email.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    errors.email = 'Email chưa đúng định dạng (ví dụ: ten@congty.vn).';
  }
  if (!password) {
    errors.password = 'Vui lòng nhập mật khẩu.';
  }
  return errors;
}

const fieldErrorStyle = { color: '#dc2626', fontSize: 13, marginTop: 4 };
const inputErrorStyle = { borderColor: '#dc2626' };

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser, loading: authLoading, refreshUser } = useAuth();

  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Đã có phiên đăng nhập (AuthContext xác nhận) thì không ở lại trang login.
  useEffect(() => {
    if (!authLoading && authUser) {
      navigate('/', { replace: true });
    }
  }, [authLoading, authUser, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    // Xoá lỗi của trường đang sửa để người dùng đỡ rối.
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    if (formError) setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const errors = validateForm(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await login(values.email.trim(), values.password);
      // Đồng bộ user vào AuthContext trước khi chuyển trang,
      // nếu không ProtectedRoute sẽ đẩy ngược lại /login.
      await refreshUser();
      const redirectTo = location.state?.from?.pathname || '/';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const serverFieldErrors = err?.fieldErrors || {};
      if (Object.keys(serverFieldErrors).length > 0) {
        setFieldErrors(serverFieldErrors);
      }
      setFormError(
        ERROR_MESSAGES[err?.code] ||
          err?.message ||
          'Đăng nhập thất bại. Vui lòng thử lại.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Web HRM tích hợp AI</h1>
          <p style={{ margin: 0, color: '#6b7280' }}>
            Đăng nhập để quản lý nhân sự, chấm công, nghỉ phép và tuyển dụng.
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="login-email" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              className="input"
              style={{ width: '100%', ...(fieldErrors.email ? inputErrorStyle : {}) }}
              placeholder="ten@congty.vn"
              autoComplete="email"
              value={values.email}
              onChange={handleChange}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              disabled={submitting}
            />
            {fieldErrors.email && (
              <div id="login-email-error" style={fieldErrorStyle} role="alert">
                {fieldErrors.email}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="login-password" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
              Mật khẩu
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className="input"
                style={{ width: '100%', ...(fieldErrors.password ? inputErrorStyle : {}) }}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                value={values.password}
                onChange={handleChange}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#2563eb',
                  fontSize: 13,
                  padding: 4,
                }}
                tabIndex={-1}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            {fieldErrors.password && (
              <div id="login-password-error" style={fieldErrorStyle} role="alert">
                {fieldErrors.password}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn"
            style={{ width: '100%' }}
            disabled={submitting}
          >
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>

        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
          Quên mật khẩu hoặc chưa có tài khoản? Vui lòng liên hệ phòng nhân sự (HR)
          để được cấp lại.
        </p>
      </div>
    </div>
  );
}
