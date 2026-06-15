# chore: prepare Render DB cutover and harden CRM anti-tracker QA

## Summary

- Prepares Render to use external Supabase database secrets without committing runtime credentials.
- Adds a post-deploy verification command for the Render API database connection.
- Expands CRM anti-tracker coverage to reject user-provided remote-loadable content in critical text inputs.
- Records the QA evidence for this branch in the CRM docs.

## What Changed

- `render.yaml`
  - Uses manually configured Render secrets for `DATABASE_URL` and `DIRECT_URL`.
  - Documents runtime pooler URL versus direct migration URL.
- `scripts/verify-render-db.mjs`
  - Verifies login and attendant read access against the deployed API.
  - Requires `CHECK_EMAIL` and `CHECK_PASSWORD`.
  - Avoids committed default credentials.
- Root `package.json`
  - Adds `npm run verify:render-db`.
- `crm/`
  - Adds negative anti-tracker tests for leads, inventory, services, document/message templates, and accountant notes.
  - Updates QA evidence in `crm/docs/qa-runs.md`.
  - Adds the operational runbook in `crm/docs/render-db-cutover-runbook.md`.
  - Adds the pre-merge audit in `crm/docs/pre-merge-audit-render-db-cutover-prep.md`.

## Validation

- `npm run test:smoke:auth`
- `npm run test:unit`
- `npm run typecheck`
- `npm run qa:daily:auto:local`
- `node --check scripts/verify-render-db.mjs`
- `npm run verify:render-db` without credentials, expecting controlled failure
- Secret/default scan against Render verification files
- `git diff --check -- render.yaml scripts/verify-render-db.mjs package.json DEPLOY.md crm`

## Rollout Notes

- This PR does not execute the database cutover.
- The cutover steps and rollback are documented in `crm/docs/render-db-cutover-runbook.md`.
- Before deployment, configure Render secrets manually:
  - `DATABASE_URL`
  - `DIRECT_URL`
- After deployment, run:

```sh
CHECK_EMAIL=<email-de-teste> CHECK_PASSWORD=<senha-de-teste> CHECK_ATTENDANT=<nome-atendente> npm run verify:render-db
```

## Risk

- Render configuration changes are sensitive to secret names and database URL format.
- CRM anti-tracker validation may reject existing unsafe text content that includes external URLs or HTML capable of loading remote resources.
- If needed, split this into two PRs:
  - Render/Supabase preparation.
  - CRM anti-tracker QA hardening.
