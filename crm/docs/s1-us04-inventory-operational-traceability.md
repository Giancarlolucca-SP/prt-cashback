# S1-US04 Inventory Operational Traceability

Status: implemented baseline.

## Implemented Evidence

| Requirement | Evidence |
|---|---|
| Authorized users can list internal stock | `GET /inventory` requires `inventory:read:STORE:general`. |
| Inventory excludes repasse by default | `GET /inventory` excludes `REPASSE` status and ownership when no explicit filter is sent. |
| Removed inventory is hidden by default | `GET /inventory` excludes `REMOVED` unless `status=REMOVED` is sent. |
| Stock cards show ownership and status | `LiveInventoryWorkspace` renders ownership/status chips from API data. |
| Stock cards show inventory entry date | `LiveInventoryWorkspace` renders `entryDate` as an `Entrada` chip on each stock card. |
| Stock cards show vehicle color | `LiveInventoryWorkspace` renders `vehicle.color` as a `Cor` chip when available. |
| Negotiation status exists in stock flow | `InventoryStatus.NEGOTIATION` is accepted by API filters/updates and rendered as `Em negociacao`. |
| Days in stock is API-calculated | `sanitizeInventory` returns `daysInStock` from `entryDate`/`exitDate`. |
| Stock cards show days in stock label | `LiveInventoryWorkspace` renders `Estoque: N dias` on each stock card. |
| Summary shows total, own, consigned, status counts and pending count | `GET /inventory` returns `summary.total`, `own`, `consigned`, percentages, `byStatus`, and `relevantPending`. |
| Summary shows active services and listings | `summary.activeServices` and `summary.activeListings` count distinct vehicles matching current filters. |
| Filters cover status, ownership, brand/model search, responsible user, origin, location, period, pending, listing, service | `GET /inventory` accepts `status`, `ownership_type`, `search`, `responsible_user_id`, `stock_origin`, `stock_location`, `entry_date_from`, `entry_date_to`, `has_pending`, `has_active_listing`, and `has_active_service`. |
| Sorts cover days, update, entry date, price, brand/model, status | `sort` accepts `days_in_stock_desc`, `days_in_stock_asc`, `updated_at_desc`, `entry_date_desc`, `price_desc`, `price_asc`, `brand_model_asc`, and `status_asc`. |
| Active listing indicator exists | List items return `hasActiveListing` and `activeListingsCount`; detail returns `activeListings`. |
| Active service/preparation indicator exists | List/detail items return `hasActiveService` and `activeService` for non-terminal service orders, including expected return when available. |
| Primary vehicle photo indicator exists | Vehicles store `primaryPhotoAttachmentId` as an internal file attachment reference; list/detail items return `hasPrimaryPhoto` without accepting arbitrary remote URLs. |
| Relevant pending indicator exists | List items return `hasRelevantPending` and `pendingSummary`. |
| Cost fields are permission-protected | `purchaseCost` is returned only when the user has `inventory:read_costs`. |
| Status updates are audited | Inventory updates write `auditLog` entries and `vehicleStatusHistory` on status changes. |
| Screen states exist | The stock workspace shows loading, fallback, error, locked, and empty states. |
| Clicking a vehicle opens its operational detail | Each stock card vehicle header is an accessible button that calls `GET /inventory/:id/detail`. |

## Automated Coverage

`tests/auth-api-smoke.ts` covers:

- owner and seller inventory access;
- seller cost masking;
- repasse exclusion;
- removed inventory default exclusion;
- days-in-stock sort;
- brand/model and status sorting;
- negotiation status update and filtering;
- responsible/origin/location/pending/listing/service filters;
- entry-period filter;
- active listing indicator and detail;
- active service indicator/detail with expected return;
- primary photo attachment reference and list/detail indicators;
- summary counts for ownership, statuses, relevant pending, active listings, and active services;
- status-change audit log.

Project-wide validation commands used for this story:

- `npm run typecheck`
- `npm run build:web`
- `npm test`

## BMAP Note

Responsible/origin/location filters are complete after migration `20260617120000_add_inventory_operational_fields`. Service return forecast is complete after migration `20260617121000_add_service_expected_return`. Primary vehicle photo reference is complete after migration `20260617123000_add_vehicle_primary_photo`, using internal attachments instead of remote media URLs. Negotiation status is complete after migration `20260617124000_add_inventory_negotiation_status`.
