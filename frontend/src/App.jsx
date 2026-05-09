import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import NovoEstabelecimento from './pages/NovoEstabelecimento.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ConsultarCliente from './pages/ConsultarCliente.jsx';
import Resgatar from './pages/Resgatar.jsx';
import CadastrarCliente from './pages/CadastrarCliente.jsx';
import Campanhas from './pages/Campanhas.jsx';
import Antifraude from './pages/Antifraude.jsx';
import Clientes from './pages/Clientes.jsx';
import Relatorios from './pages/Relatorios.jsx';
import ConfiguracoesCashback from './pages/ConfiguracoesCashback.jsx';
import ConfiguracoesPosto from './pages/ConfiguracoesPosto.jsx';
import Ranking from './pages/Ranking.jsx';
import ToastContainer from './components/ui/Toast.jsx';

export default function App() {
  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<NovoEstabelecimento />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          <Route path="/consultar" element={<ConsultarCliente />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/resgatar" element={<Resgatar />} />
          <Route path="/cadastrar" element={<CadastrarCliente />} />
          <Route path="/campanhas" element={<Campanhas />} />
          <Route path="/antifraude" element={<Antifraude />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/relatorios"              element={<Relatorios />} />
          <Route path="/configuracoes-cashback"  element={<ConfiguracoesCashback />} />
          <Route path="/configuracoes-posto"     element={<ConfiguracoesPosto />} />
          <Route path="/ranking"                 element={<Ranking />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
