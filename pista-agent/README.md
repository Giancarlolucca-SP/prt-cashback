# Agente da Pista (pista-agent)

Serviço local que lê abastecimentos do concentrador Companytec (CBC) e envia para a nuvem PostoCash.
**Somente leitura** no concentrador (`&A` / `&I` / `&S`). Não toca em NFC-e/fiscal/Petros.

## Configuração (`.env`)
Copie `.env.example` para `.env` e ajuste:
- `CONCENTRADOR_HOST` / `CONCENTRADOR_PORT` — emulador `127.0.0.1:2001`; concentrador real `857`.
- `READ_MODE` — `identified` ("(&A67)", captura o Identfid/frentista, §3.1.3) ou `plain` ("(&A)", §3.1.1).
- `POLL_INTERVAL_MS`, `RETRY_INTERVAL_MS`, `SOCKET_TIMEOUT_MS`, `USE_CHECKSUM`.
- `POSTOCASH_API_URL`, `AGENT_TOKEN`, `ESTABLISHMENT_ID`.

### Configuração remota (Painel da Pista → Concentrador)
Ao iniciar, o agente busca `CONCENTRADOR_HOST`/`PORT`/intervalos/`USE_CHECKSUM`/`READ_MODE` da
nuvem (tela **Concentrador** no Painel da Pista, admin) e eles **sobrepõem** os valores do `.env`
quando existir uma configuração salva. Isso evita ter que editar o `.env` de cada posto na mão
para mudar host/porta/timeout. Se a nuvem estiver inacessível no boot, ou nenhuma configuração
tiver sido salva ainda, o agente cai de volta nos valores locais do `.env`. **Mudanças feitas na
tela só valem depois de reiniciar o agente** (a busca é feita uma vez, no start).

### Heartbeat (status online/offline)
A cada ~20s o agente reporta à nuvem se está conectado ao concentrador (independente de haver
abastecimento — evita marcar um posto parado como "offline" só por falta de movimento). A tela
**Concentrador** mostra "Agente online/offline", há quanto tempo foi o último contato, a versão
e o último erro, se houver. Sem contato por mais de ~60s (3 heartbeats perdidos) = offline.

## Rodar
```bash
npm install
npm start          # loop contínuo: conecta, lê, envia; reconecta sozinho na queda
npm test           # testes do protocolo (offline)
npm run fake       # concentrador falso p/ teste local (127.0.0.1:2001)
```

## Modo contínuo (always-on)
`npm start` já roda em **loop infinito** com reconexão automática (lê novos abastecimentos
continuamente, alimentando o dashboard ao vivo). Para deixá-lo sempre ligado, rode como serviço:

- **PM2:** `npm i -g pm2 && pm2 start index.js --name pista-agent && pm2 save`
- **Windows (Agendador de Tarefas):** ação = `node`, argumento = `index.js`, iniciar em `pista-agent`, "executar estando o usuário conectado ou não" + "reiniciar em caso de falha".
- **nohup/Linux:** `nohup npm start > agent.log 2>&1 &`

## Durabilidade
Cada abastecimento é gravado em `data/pending.jsonl` **antes** de avançar o ponteiro (`&I`),
e o `&I` só é enviado após a nuvem confirmar (HTTP 2xx). Reenvios são idempotentes (dedupe na nuvem).

## Notas de protocolo
- `encerranteFinal` é o totalizador com **2 casas decimais** (ex.: `1625` → `16.25`).
- A leitura `&A` não traz o ano → assume o ano corrente. `fuelCode` não vem no `&A`; a classificação
  de combustível é resolvida na nuvem pelo **mapa de bico** (Painel da Pista → Combustíveis).
- O identificador `I[16]` (§3.1.3) é o cartão Identfid do frentista → resolvido na nuvem pelo
  **mapa de cartões** (Painel da Pista → Cartões).
