import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext.jsx';
import { authAPI } from '../services/api.js';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';

// ── Icons ──────────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
      <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

// ── Google login button (child component so useGoogleLogin runs inside provider) ─

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Debug: log the env var so we can confirm it's being picked up
console.log('GOOGLE_CLIENT_ID:', googleClientId);

function GoogleLoginButton({ onSuccess, onError, disabled }) {
  const googleLogin = useGoogleLogin({ onSuccess, onError });
  return (
    <button
      type="button"
      onClick={() => googleLogin()}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-700 font-medium text-sm shadow-sm"
    >
      <GoogleIcon />
      Continuar com Google
    </button>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Login() {
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

  const { login } = useAuth();
  const navigate  = useNavigate();

  useEffect(() => {
    const name = localStorage.getItem('postocash_last_name');
    document.title = name ? `Login — ${name} | PostoCash` : 'Login | PostoCash';
  }, []);

  // Load Facebook SDK
  useEffect(() => {
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    if (!appId) return;

    window.fbAsyncInit = function () {
      window.FB.init({ appId, cookie: true, xfbml: false, version: 'v18.0' });
    };

    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id    = 'facebook-jssdk';
      script.src   = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, []);

  // ── Shared post-OAuth redirect ──────────────────────────────────────────────
  function handleOAuthSuccess(data) {
    login(data.token, data.operador);
    if (!data.operador?.estabelecimentoId) {
      navigate('/completar-cadastro', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }

  // ── Google OAuth handlers (passed down to child component) ──────────────────
  async function handleGoogleSuccess(tokenResponse) {
    setError('');
    setLoading(true);
    try {
      const { data } = await authAPI.googleLogin(tokenResponse.access_token);
      handleOAuthSuccess(data);
    } catch (err) {
      setError(err.response?.data?.erro || 'Erro ao fazer login com Google.');
    } finally {
      setLoading(false);
    }
  }

  // ── Facebook OAuth ──────────────────────────────────────────────────────────
  function handleFacebookLogin() {
    if (!window.FB) {
      setError('SDK do Facebook não carregado. Tente novamente em instantes.');
      return;
    }
    window.FB.login(async (response) => {
      if (!response.authResponse?.accessToken) {
        setError('Login com Facebook cancelado.');
        return;
      }
      setError('');
      setLoading(true);
      try {
        const { data } = await authAPI.facebookLogin(response.authResponse.accessToken);
        handleOAuthSuccess(data);
      } catch (err) {
        setError(err.response?.data?.erro || 'Erro ao fazer login com Facebook.');
      } finally {
        setLoading(false);
      }
    }, { scope: 'email,public_profile' });
  }

  // ── Email/password login ────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Preencha e-mail e senha.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await authAPI.login(email.trim(), password);
      login(data.token, data.operador);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.erro || 'Erro ao fazer login. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/logo-vertical.svg" alt="PostoCash" className="h-28 w-auto object-contain" />
          </div>
          <p className="text-sm text-gray-500">Acesso ao sistema de postos</p>
        </div>

        {/* Social login buttons */}
        <div className="space-y-3 mb-5">
          {googleClientId ? (
            <GoogleLoginButton
              onSuccess={handleGoogleSuccess}
              onError={() => setError('Login com Google cancelado ou falhou.')}
              disabled={loading}
            />
          ) : (
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white opacity-50 cursor-not-allowed text-gray-700 font-medium text-sm shadow-sm"
            >
              <GoogleIcon />
              Continuar com Google
            </button>
          )}

          <button
            type="button"
            onClick={handleFacebookLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-700 font-medium text-sm shadow-sm"
          >
            <FacebookIcon />
            Entrar com Facebook
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">ou continue com e-mail</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="E-mail"
            id="email"
            type="email"
            placeholder="operador@posto.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
          <Input
            label="Senha"
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            suffix={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            }
          />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" fullWidth size="lg" loading={loading}>
            Entrar
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Ainda não tem conta?{' '}
          <Link to="/register" className="text-primary-600 font-semibold hover:underline">
            Cadastre seu posto
          </Link>
        </p>
      </div>
    </div>
  );
}
