/**
 * Operator (frentista) lockdown.
 *
 * A user with the OPERATOR role may ONLY reach the Painel da Pista endpoints
 * below (Dashboard + baixa de cashback + fechamento de caixa coletivo).
 * Everything else returns 403. ADMIN / SUPERADMIN, customer (app) tokens, the
 * agent token and public/unauthenticated requests pass through untouched.
 *
 * Centralised here (mounted before the routers in app.js) so the rule lives in
 * one place and can't be forgotten on a new endpoint.
 */
const jwt = require('jsonwebtoken');

const OPERATOR_WHITELIST = [
  { method: 'GET',  re: /^\/pista\/dashboard$/ },
  { method: 'GET',  re: /^\/pista\/fuelings$/ },
  { method: 'GET',  re: /^\/pista\/caixa$/ },                 // fechamento coletivo
  { method: 'POST', re: /^\/pista\/accrual$/ },               // Plano B (CPF + valor)
  { method: 'POST', re: /^\/pista\/accrual-from-fueling$/ },
  { method: 'GET',  re: /^\/pista\/redemption-requests$/ },
  { method: 'POST', re: /^\/pista\/redemption-requests\/[^/]+\/(confirm|cancel)$/ },
  { method: 'GET',  re: /^\/pista\/comprovante\/[^/]+\/[^/]+$/ },
  // Read-only, establishment-scoped: lets the FrentistaBar picker load who's on shift.
  { method: 'GET',  re: /^\/attendants\/?$/ },
];

function operatorLockdown(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();          // public / non-bearer

  let payload;
  try {
    payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
  } catch {
    return next();                                            // invalid / agent token -> route's own auth handles it
  }

  if (payload.type === 'customer') return next();             // mobile app tokens
  if (payload.role !== 'OPERATOR') return next();             // ADMIN / SUPERADMIN -> full access

  const allowed = OPERATOR_WHITELIST.some((a) => a.method === req.method && a.re.test(req.path));
  if (allowed) return next();

  return res.status(403).json({
    erro: 'Acesso restrito ao Painel da Pista (Dashboard, baixa de cashback e fechamento de caixa).',
  });
}

module.exports = { operatorLockdown };
