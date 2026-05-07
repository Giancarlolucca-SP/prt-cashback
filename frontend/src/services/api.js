import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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
  login: (email, password) => api.post('/auth/login', { email, password }),
};

// ── Customers ─────────────────────────────────────────────────────────────────
export const customersAPI = {
  upsert: (data) => api.post('/customers', data),
  findByCpf: (cpf) => api.get(`/customers/${cpf}`),
  listAll: (page = 1) => api.get('/customers/all', { params: { page } }),
  list: (search = '', page = 1) => api.get('/customers', { params: { search, page } }),
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
};

// ── Campaigns ─────────────────────────────────────────────────────────────────
export const campaignsAPI = {
  preview:      (params) => api.get('/campaigns/preview', { params }),
  create:       (data)   => api.post('/campaigns', data),
  list:         (status, page = 1) => api.get('/campaigns', { params: { status, page } }),
  close:        (id)     => api.patch(`/campaigns/${id}/close`),
  getReturnees: (id)     => api.get(`/campaigns/${id}/returnees`),
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

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportsAPI = {
  preview: (params) => api.get('/reports/preview', { params }),
  exportPDF: (params) =>
    api.get('/reports/export/pdf',   { params, responseType: 'blob', timeout: 60000 }),
  exportExcel: (params) =>
    api.get('/reports/export/excel', { params, responseType: 'blob', timeout: 60000 }),
};

export default api;
