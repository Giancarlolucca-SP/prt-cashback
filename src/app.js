require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
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
const stripeRoutes              = require('./routes/stripeRoutes');
const rankingRoutes             = require('./routes/rankingRoutes');
const adminRoutes               = require('./routes/adminRoutes');
const { webhook: stripeWebhook } = require('./controllers/stripeController');

const app = express();
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // keep disabled — API consumed by mobile
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://app.sistemapostocash.app',
  'https://www.sistemapostocash.app',
  'https://sistemapostocash.app',
  'https://app.postocash.com.br',
  'https://www.postocash.com.br',
  'https://prt-cashback.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origem não permitida — ${origin}`));
  },
  credentials: true,
}));

// ── Stripe webhook — raw body MUST come before express.json() ────────────────
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

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
app.use('/admin',                  adminRoutes);
app.use('/stripe',                 stripeRoutes);
app.use('/ranking',                rankingRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
