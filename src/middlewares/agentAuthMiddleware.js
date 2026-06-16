/**
 * Authenticates the local "Agente da Pista" (concentrator agent) via a shared
 * token, separate from operator/customer JWTs. The token is sent as
 *   Authorization: Bearer <AGENT_TOKEN>   (or  X-Agent-Token: <AGENT_TOKEN>)
 * and AGENT_TOKEN must be configured on the server (.env).
 */
function authenticateAgent(req, res, next) {
  const expected = process.env.AGENT_TOKEN;
  if (!expected) {
    return res.status(503).json({ erro: 'AGENT_TOKEN não configurado no servidor.' });
  }

  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token  = bearer || req.headers['x-agent-token'];

  if (!token || token !== expected) {
    return res.status(401).json({ erro: 'Token do agente inválido.' });
  }
  req.agent = { authenticated: true };
  next();
}

module.exports = { authenticateAgent };
