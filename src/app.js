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
const ratingRoutes              = require('./routes/ratingRoutes');
const attendantRoutes           = require('./routes/attendantRoutes');
const pistaRoutes               = require('./routes/pistaRoutes');
const agentRoutes               = require('./routes/agentRoutes');
const operatorRoutes            = require('./routes/operatorRoutes');
const adminRoutes               = require('./routes/adminRoutes');
const { operatorLockdown }      = require('./middlewares/operatorLockdown');
const { handleWebhook: stripeWebhook } = require('./controllers/stripeController');

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

// Per-posto local installs serve the panel from the station's own machine —
// staff on other devices on the same LAN reach it via that machine's local
// IP (e.g. http://192.168.0.20:5173), not localhost. Without this, that
// documented access path is silently rejected by CORS since the fixed
// allowlist above only ever covers localhost/the public domains.
function isPrivateLanOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname);
  } catch {
    return false;
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || isPrivateLanOrigin(origin)) return callback(null, true);
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

// ── Operator (frentista) lockdown — only the Pista dashboard + baixa endpoints ──
app.use(operatorLockdown);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/operators', operatorRoutes);
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
app.use('/ratings',                ratingRoutes);
app.use('/attendants',             attendantRoutes);
app.use('/pista/abastecimentos',   agentRoutes); // agent-token auth — must precede /pista
app.use('/pista',                  pistaRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
