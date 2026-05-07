import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [operator, setOperator] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('postocash_token');
    const storedOperator = localStorage.getItem('postocash_operator');
    if (storedToken && storedOperator) {
      setToken(storedToken);
      setOperator(JSON.parse(storedOperator));
    }
    setLoading(false);
  }, []);

  function login(tokenValue, operatorData) {
    localStorage.setItem('postocash_token', tokenValue);
    localStorage.setItem('postocash_operator', JSON.stringify(operatorData));
    // persist logo + name so the login page can show them before next login
    if (operatorData.logoUrl)       localStorage.setItem('postocash_last_logo', operatorData.logoUrl);
    if (operatorData.estabelecimento) localStorage.setItem('postocash_last_name', operatorData.estabelecimento);
    setToken(tokenValue);
    setOperator(operatorData);
  }

  function logout() {
    localStorage.removeItem('postocash_token');
    localStorage.removeItem('postocash_operator');
    // keep postocash_last_logo / postocash_last_name so login page stays branded
    setToken(null);
    setOperator(null);
  }

  function updateOperator(updates) {
    setOperator((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem('postocash_operator', JSON.stringify(next));
      return next;
    });
  }

  const isAdmin = operator?.perfil === 'ADMIN';

  return (
    <AuthContext.Provider value={{ operator, token, isAdmin, loading, login, logout, updateOperator }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
