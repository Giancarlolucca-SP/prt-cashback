import axios from 'axios';

// In production VITE_API_URL points to Render backend (or, for a per-posto
// local install, to that machine's own localhost:3000 — see frontend/.env).
// This fallback is only used if VITE_API_URL isn't set at build time.
const API_URL = import.meta.env.VITE_API_URL || 'https://postocash-api-udnj.onrender.com';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('postocash_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally: clear session and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('postocash_token');
      localStorage.removeItem('postocash_operator');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:         (email, password) => api.post('/auth/login',    { email, password }),
  googleLogin:   (token)           => api.post('/auth/google',   { token }),
  facebookLogin: (token)           => api.post('/auth/facebook', { token }),
};

// ── Customers ─────────────────────────────────────────────────────────────────
export const customersAPI = {
  upsert: (data) => api.post('/customers', data),
  findByCpf: (cpf) => api.get(`/customers/${cpf}`),
  listAll: (page = 1, includeUnregistered = false) =>
    api.get('/customers/all', { params: { page, ...(includeUnregistered ? { includeUnregistered: 1 } : {}) } }),
  list: (search = '', page = 1, includeUnregistered = false) =>
    api.get('/customers', { params: { search, page, ...(includeUnregistered ? { includeUnregistered: 1 } : {}) } }),
};

// ── Painel da Pista (cashback interno do frentista) ───────────────────────────
export const pistaAPI = {
  accrue:            (data)      => api.post('/pista/accrual', data),                 // Plano B: CPF + valor
  accrueFromFueling: (data)      => api.post('/pista/accrual-from-fueling', data),    // seleção de abastecimento
  fuelings:          (params = {}) => api.get('/pista/fuelings', { params }),
  dashboard:         ()          => api.get('/pista/dashboard'),
  listRequests:      ()          => api.get('/pista/redemption-requests'),
  confirmRequest:    (id, data)  => api.post(`/pista/redemption-requests/${id}/confirm`, data),
  cancelRequest:     (id)        => api.post(`/pista/redemption-requests/${id}/cancel`),
  comprovante:       (type, id)  => api.get(`/pista/comprovante/${type}/${id}`),
  caixa:             (params = {}) => api.get('/pista/caixa', { params }),
  // Config — fuel map (bico → combustível)
  fuelMap:           ()          => api.get('/pista/fuel-map'),
  upsertFuelMap:     (data)      => api.post('/pista/fuel-map', data),
  deleteFuelMap:     (id)        => api.delete(`/pista/fuel-map/${id}`),
  backfillFuel:      ()          => api.post('/pista/fuel-map/backfill'),
  // Config — card map (Identfid → frentista)
  cardMap:           ()          => api.get('/pista/card-map'),
  upsertCardMap:     (data)      => api.post('/pista/card-map', data),
  deleteCardMap:     (id)        => api.delete(`/pista/card-map/${id}`),
  // Config — concentrador (Companytec, conexão TCP do agente local)
  concentradorConfig:       ()      => api.get('/pista/concentrador-config'),
  updateConcentradorConfig: (data)  => api.put('/pista/concentrador-config', data),
};

// ── Transactions ──────────────────────────────────────────────────────────────
export const transactionsAPI = {
  earn: (data) => api.post('/transactions', data),
  listByCpf: (cpf) => api.get(`/transactions/${cpf}`),
};

// ── Redemptions ───────────────────────────────────────────────────────────────
export const redemptionsAPI = {
  redeem: (data) => api.post('/redeem', data),
  listByCpf: (cpf) => api.get(`/redeem/${cpf}`),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  getAnalytics:       (params = {}) => api.get('/dashboard',                 { params }),
  getCampaignResults: (params = {}) => api.get('/dashboard/campaign-results',{ params }),
  getFuelTypes:       (params = {}) => api.get('/dashboard/fuel-types',      { params }),
  getAttendants:      (params = {}) => api.get('/dashboard/attendants',      { params }),
};

// ── Campaigns ─────────────────────────────────────────────────────────────────
export const campaignsAPI = {
  preview:          (params) => api.get('/campaigns/preview', { params }),
  create:           (data)   => api.post('/campaigns', data),
  list:             (status, page = 1) => api.get('/campaigns', { params: { status, page } }),
  close:            (id)     => api.patch(`/campaigns/${id}/close`),
  getReturnees:     (id)     => api.get(`/campaigns/${id}/returnees`),
  getQueueStatus:   (id)     => api.get(`/campaigns/${id}/queue-status`),
  getGlobalQueue:   ()       => api.get('/campaigns/queue-status'),
};

// ── Establishments ────────────────────────────────────────────────────────────
export const establishmentsAPI = {
  create: (data) => api.post('/establishments', data),
  list:   ()     => api.get('/establishments'),
  getQRCode: (id) => api.get(`/establishments/${id}/qrcode`, { responseType: 'blob' }),
  uploadLogo: (id, file, onProgress) => {
    const form = new FormData();
    form.append('logo', file);
    return api.post(`/establishments/${id}/logo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
        ? (e) => onProgress(Math.round((e.loaded * 100) / (e.total || 1)))
        : undefined,
    });
  },
  updateBranding: (id, data) => api.patch(`/establishments/${id}/branding`, data),
};

// ── Fraud ─────────────────────────────────────────────────────────────────────
export const fraudAPI = {
  getSettings:         ()           => api.get('/fraud/settings'),
  updateSettings:      (data)       => api.put('/fraud/settings', data),
  getBlacklist:        ()           => api.get('/fraud/blacklist'),
  addToBlacklist:      (data)       => api.post('/fraud/blacklist', data),
  removeFromBlacklist: (cpf)        => api.delete(`/fraud/blacklist/${cpf}`),
};

// ── Cashback Settings ─────────────────────────────────────────────────────────
export const cashbackSettingsAPI = {
  get:    ()     => api.get('/cashback-settings'),
  update: (data) => api.put('/cashback-settings', data),
};

// ── Stripe / Subscription ─────────────────────────────────────────────────────
export const subscriptionAPI = {
  getStatus: () => api.get('/stripe/subscription/my'),
  cancel:    () => api.post('/stripe/cancel-subscription'),
};

// ── Ranking ───────────────────────────────────────────────────────────────────
export const rankingAPI = {
  get: (params = {}) => api.get('/ranking', { params }),
};

// ── Ratings (avaliações de atendentes) ────────────────────────────────────────
export const ratingsAPI = {
  // Admin/operator: list ratings (newest first) + per-attendant aggregates
  get: (params = {}) => api.get('/ratings', { params }),
};

// ── Operadores (logins de frentista — admin only) ─────────────────────────────
export const operatorsAPI = {
  list:   ()     => api.get('/operators'),
  create: (data) => api.post('/operators', data),
  remove: (id)   => api.delete(`/operators/${id}`),
};

// ── Attendants (registro de frentistas) ───────────────────────────────────────
export const attendantsAPI = {
  list:   ()         => api.get('/attendants'),
  sync:   ()         => api.post('/attendants/sync'),
  create: (data)     => api.post('/attendants', data),
  update: (id, data) => api.patch(`/attendants/${id}`, data),
  remove: (id)       => api.delete(`/attendants/${id}`),
  uploadPhoto: (id, file) => {
    const form = new FormData();
    form.append('photo', file);
    return api.post(`/attendants/${id}/photo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ── Establishment completion (OAuth) ─────────────────────────────────────────
export const registrationAPI = {
  completarCadastro: (data) => api.post('/establishments/completar-cadastro', data),
};

// ── Admin / SaaS ──────────────────────────────────────────────────────────────
export const adminAPI = {
  getSaasMetrics: () => api.get('/admin/saas-metrics'),
};

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportsAPI = {
  preview: (params) => api.get('/reports/preview', { params }),
  exportPDF: (params) =>
    api.get('/reports/export/pdf',   { params, responseType: 'blob', timeout: 60000 }),
  exportExcel: (params) =>
    api.get('/reports/export/excel', { params, responseType: 'blob', timeout: 60000 }),
};

export default api;
