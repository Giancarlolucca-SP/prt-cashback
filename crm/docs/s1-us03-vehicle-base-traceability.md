# S1-US03 Vehicle Base Traceability

Status: implemented baseline complete for in-scope S1-US03 criteria.

## Implemented Evidence

| Requirement | Evidence |
|---|---|
| Authorized users can create/list stock vehicles | `POST /inventory` and `GET /inventory` require inventory permissions. |
| Required vehicle fields are validated | Create schema requires brand, model, year model, ownership type, status and entry date. |
| Plate is normalized and unique per store | `vehiclePayloadSchema` uppercases/validates plate and create rejects duplicate active plates. |
| Own and consigned inventory are represented | `ownershipType` supports `OWN`, `CONSIGNED` and `TRADE_IN`; list summary separates own and consigned. |
| Consigned vehicles require customer and agreed value | `enforceConsignedInventoryRules` requires `ownerCustomerId` and positive `purchaseCost`. |
| Vehicle folder/documents are represented | `GET /inventory/:id/detail` lists file attachments linked to `vehicle` or `vehicle_inventory`. |
| Consignment contract can be attached | File upload links support `vehicle_inventory` with `purpose=consignment_contract`. |
| Active listings are visible from vehicle detail | Detail returns `activeListings` for `PENDING` and `PUBLISHED` listings. |
| Repasse is separated from common stock | Common inventory rejects `REPASSE` creation and default listing excludes repasse records. |
| Seller/SDR cost masking exists | `purchaseCost` is returned only when the user has `inventory:read_costs`. |
| Status and ownership changes are audited | Inventory update writes audit logs and `vehicleStatusHistory` for status changes. |
| UI covers loading, empty, error and locked states | `LiveInventoryWorkspace` renders those states for the stock workspace. |

## Automated Coverage

`tests/auth-api-smoke.ts` covers:

- invalid vehicle payloads;
- seller operational vehicle creation with cost masking;
- own and consigned inventory creation;
- consigned validation and consignment contract attachment;
- duplicate plate conflict;
- default exclusion of repasse and explicit repasse separation;
- owner/seller stock reads and cost masking;
- search by plate/year and filters by status/ownership;
- detail documents and active listings;
- status and ownership audit logs;
- primary photo attachment reference.

Project-wide validation commands used across this story:

- `npm run typecheck`
- `npm run build:web`
- `npm test`

## BMAP Note

S1-US03 is considered complete for the MVP baseline. Advanced items remain out of scope here, including full FIPE/RPA integration, advanced media workflows, complete contract generation and complete technical evaluation flows.
