# S1-US02 Customer History Traceability

Status: implemented baseline complete for in-scope S1-US02 criteria.

## Implemented Evidence

| Requirement | Evidence |
|---|---|
| Customer history endpoint exists | `GET /customers/:id/history` returns sales, purchase leads, evaluations, appointments, events and a unified `timeline`. |
| Manual history notes exist | `POST /customers/:id/history-notes` creates `customer.manual_note_created` events. |
| Minimal lead creation creates history | Minimal lead flow records `customer.minimal_lead_created`. |
| Full customer creation creates history | Customer creation is represented in the customer history response. |
| Timeline combines operational domains | Customer history merges sales, purchases, evaluations, appointments and events. |
| Timeline has filters and search in UI | `LiveCustomersWorkspace` filters timeline groups and supports textual search. |
| Expanded history modal exists | Customer history can be opened in a full modal, reusing filters/search/details. |
| Timeline item details are expandable | `LiveCustomersWorkspace` renders expandable item details by type. |
| Preferences are persisted | Timeline filter/search preferences are stored locally and synced through auth preferences. |
| Manual notes block remote tracker vectors | History note validation uses `containsRemoteLoadVector`; smoke covers remote tracker rejection. |
| Access control is enforced | Customer history routes use customer permissions and scoped access checks. |

## Automated Coverage

`tests/auth-api-smoke.ts` covers:

- customer and minimal lead history events;
- customer history timeline response;
- appointments in customer history;
- manual history note creation;
- remote tracker rejection in history notes;
- seller scoped history access.

Additional documentation and audit artifacts:

- `docs/pre-merge-audit-s1-us02-customer-timeline-notes.md`
- `docs/pr-body-s1-us02-customer-timeline-notes.md`
- `docs/qa-runs.md` customer history entries and QA commands

Project-wide validation commands used across this story:

- `npm run typecheck`
- `npm run build:web`
- `npm test`
- customer-history-specific QA commands documented in `docs/qa-runs.md`

## BMAP Note

S1-US02 is considered complete for the MVP baseline. Real WhatsApp/e-mail import, IA insights, advanced sales/documentation Kanban and long-term post-sale automation remain out of scope for this story.
