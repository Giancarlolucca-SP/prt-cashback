# Agente da Pista (pista-agent)

Serviço local que lê abastecimentos do concentrador Companytec (CBC) e envia para a nuvem PostoCash.
**Somente leitura** no concentrador (`&A` / `&I` / `&S`). Não toca em NFC-e/fiscal/Petros.

## Configuração (`.env`)
Copie `.env.example` para `.env` e ajuste:
- `CONCENTRADOR_HOST` / `CONCENTRADOR_PORT` — emulador `127.0.0.1:2001`; concentrador real `857`.
- `READ_MODE` — `identified` ("(&A67)", captura o Identfid/frentista, §3.1.3) ou `plain` ("(&A)", §3.1.1).
- `POLL_INTERVAL_MS`, `RETRY_INTERVAL_MS`, `SOCKET_TIMEOUT_MS`, `USE_CHECKSUM`.
- `POSTOCASH_API_URL`, `AGENT_TOKEN`, `ESTABLISHMENT_ID`.

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
