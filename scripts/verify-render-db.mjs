/**
 * Verifica se a API do Render está usando o MESMO banco (Supabase) do .env local.
 *
 * Critério: o usuário/atendente abaixo só existe no Supabase. Se o Render usar o
 * mesmo banco, o login retorna 200 e o atendente aparece na lista.
 *
 * Uso:  node scripts/verify-render-db.mjs
 *   (opcional) RENDER_URL, CHECK_EMAIL, CHECK_PASSWORD, CHECK_ATTENDANT via env.
 */
const RENDER = process.env.RENDER_URL || 'https://postocash-api.onrender.com';
const EMAIL = process.env.CHECK_EMAIL || 'admin@autoposto.com';
const PASSWORD = process.env.CHECK_PASSWORD || 'SuaNovaSenhaForte123';
const ATTENDANT = process.env.CHECK_ATTENDANT || 'JUNIOR';

const j = async (r) => {
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; }
  catch { return { status: r.status, body: t.slice(0, 200) }; }
};

(async () => {
  console.log(`Alvo: ${RENDER}`);
  const login = await fetch(`${RENDER}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then(j).catch((e) => ({ status: 'ERR', body: e.message }));

  console.log(`POST /auth/login (${EMAIL}): ${login.status}`);

  if (login.status === 200 && login.body?.token) {
    const att = await fetch(`${RENDER}/attendants`, {
      headers: { Authorization: `Bearer ${login.body.token}` },
    }).then(j).catch((e) => ({ status: 'ERR', body: e.message }));
    const nomes = (att.body?.attendants || []).map((a) => a.name);
    const achou = nomes.includes(ATTENDANT);
    console.log(`GET /attendants: ${att.status} · nomes=${JSON.stringify(nomes)}`);
    console.log(achou
      ? `✅ MESMO BANCO — atendente "${ATTENDANT}" encontrado. Render = Supabase.`
      : `⚠️  Login OK, mas "${ATTENDANT}" não está na lista — confira se é o mesmo banco/dado.`);
  } else if (login.status === 401) {
    console.log('❌ 401 — usuário não existe nesse banco. Render usa OUTRO banco.');
  } else if (login.status === 500) {
    console.log('❌ 500 — schema/banco do Render incompatível (ainda não apontou pro Supabase ou código defasado).');
  } else {
    console.log('Resposta:', JSON.stringify(login.body).slice(0, 200));
  }
})();
