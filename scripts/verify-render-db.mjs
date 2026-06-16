/**
 * Verifica se a API do Render esta usando o banco esperado.
 *
 * Criterio: autentica com um usuario conhecido do banco alvo e confirma que um
 * atendente esperado aparece na lista retornada pela API.
 *
 * Uso:
 *   CHECK_EMAIL=... CHECK_PASSWORD=... CHECK_ATTENDANT=... node scripts/verify-render-db.mjs
 *
 * Variaveis opcionais:
 *   RENDER_URL=https://postocash-api.onrender.com
 */
const renderUrl = process.env.RENDER_URL || "https://postocash-api.onrender.com";
const email = process.env.CHECK_EMAIL;
const password = process.env.CHECK_PASSWORD;
const attendant = process.env.CHECK_ATTENDANT || "JUNIOR";

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
}

async function parseResponse(response) {
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text.slice(0, 200) };
  }
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

requireEnv("CHECK_EMAIL", email);
requireEnv("CHECK_PASSWORD", password);

console.log(`Alvo: ${renderUrl}`);
const login = await fetch(`${renderUrl}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
})
  .then(parseResponse)
  .catch((error) => ({ status: "ERR", body: error.message }));

console.log(`POST /auth/login (${email}): ${login.status}`);

if (login.status === 200 && login.body?.token) {
  const attendants = await fetch(`${renderUrl}/attendants`, {
    headers: { Authorization: `Bearer ${login.body.token}` },
  })
    .then(parseResponse)
    .catch((error) => ({ status: "ERR", body: error.message }));

  const names = (attendants.body?.attendants || []).map((item) => item.name);
  const found = names.includes(attendant);
  console.log(`GET /attendants: ${attendants.status} names=${JSON.stringify(names)}`);

  if (found) {
    console.log(`OK: atendente "${attendant}" encontrado. Render usa o banco esperado.`);
  } else {
    fail(`WARN: login OK, mas "${attendant}" nao esta na lista. Confira banco/dados.`);
  }
} else if (login.status === 401) {
  fail("FAIL: 401. Usuario nao existe nesse banco ou senha invalida.");
} else if (login.status === 500) {
  fail("FAIL: 500. Schema/banco do Render possivelmente incompativel.");
} else {
  fail(`FAIL: resposta inesperada: ${JSON.stringify(login.body).slice(0, 200)}`);
}
