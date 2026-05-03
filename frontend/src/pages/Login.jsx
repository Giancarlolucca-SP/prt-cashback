import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { authAPI } from '../services/api.js';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';

function LoginLogo() {
  const [failed, setFailed] = useState(false);
  const src  = localStorage.getItem('prt_last_logo');
  const name = localStorage.getItem('prt_last_name');

  if (!src || failed) {
    return <div className="text-5xl mb-3">⛽</div>;
  }
  return (
    <div className="flex justify-center mb-3">
      <img
        src={src}
        alt={name || 'Logo'}
        onError={() => setFailed(true)}
        className="h-16 max-w-[160px] object-contain"
      />
    </div>
  );
}

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    const name = localStorage.getItem('prt_last_name');
    document.title = name ? `Login — ${name} | PRT Cashback` : 'Login | PRT Cashback';
  }, []);

  const { login } = useAuth();
  const navigate  = useNavigate();

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
      const msg = err.response?.data?.erro || 'Erro ao fazer login. Verifique suas credenciais.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <LoginLogo />
          <h1 className="text-2xl font-bold text-gray-900">PRT Cashback</h1>
          <p className="text-sm text-gray-500 mt-1">Acesso ao sistema de postos</p>
        </div>

        {/* Form */}
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
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
