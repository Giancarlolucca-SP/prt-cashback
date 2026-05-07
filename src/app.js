require('dotenv').config();
const path    = require('path');
const express = require('express');
const { apiLimiter } = require('./middlewares/rateLimitMiddleware');
const { errorHandler } = require('./middlewares/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const redemptionRoutes = require('./routes/redemptionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const fraudRoutes = require('./routes/fraudRoutes');
const establishmentRoutes = require('./routes/establishmentRoutes');
const reportRoutes              = require('./routes/reportRoutes');
const cashbackSettingsRoutes    = require('./routes/cashbackSettingsRoutes');
const appRoutes                 = require('./routes/appRoutes');
const adminPhotoRoutes          = require('./routes/adminPhotoRoutes');

const app = express();
app.set('trust proxy', 1);

// ── Static files ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── ngrok browser warning bypass ─────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// ── Body parsing ──────────────────────────────────────────────────────────────
// Limit raised to 5 MB to accommodate base64-encoded selfie images and receipt photos
app.use(express.json({ limit: '5mb' }));

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use(apiLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    sistema: 'PostoCash',
    versao: '1.0.0',
    hora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/customers', customerRoutes);
app.use('/transactions', transactionRoutes);
app.use('/redeem', redemptionRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/fraud', fraudRoutes);
app.use('/establishments', establishmentRoutes);
app.use('/reports',                reportRoutes);
app.use('/cashback-settings',      cashbackSettingsRoutes);
app.use('/app',                    appRoutes);
app.use('/admin/photo-validations', adminPhotoRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
