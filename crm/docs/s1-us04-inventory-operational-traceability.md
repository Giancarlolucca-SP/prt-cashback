# S1-US04 Inventory Operational Traceability

Status: implemented baseline with remaining explicit deferred fields.

## Implemented Evidence

| Requirement | Evidence |
|---|---|
| Authorized users can list internal stock | `GET /inventory` requires `inventory:read:STORE:general`. |
| Inventory excludes repasse by default | `GET /inventory` excludes `REPASSE` status and ownership when no explicit filter is sent. |
| Removed inventory is hidden by default | `GET /inventory` excludes `REMOVED` unless `status=REMOVED` is sent. |
| Stock cards show ownership and status | `LiveInventoryWorkspace` renders ownership/status chips from API data. |
| Days in stock is API-calculated | `sanitizeInventory` returns `daysInStock` from `entryDate`/`exitDate`. |
| Summary shows total, own, consigned, status counts | `GET /inventory` returns `summary.total`, `own`, `consigned`, percentages, and `byStatus`. |
| Summary shows active services and listings | `summary.activeServices` and `summary.activeListings` count distinct vehicles matching current filters. |
| Filters cover status, ownership, brand/model search, responsible user, origin, location, period, pending, listing, service | `GET /inventory` accepts `status`, `ownership_type`, `search`, `responsible_user_id`, `stock_origin`, `stock_location`, `entry_date_from`, `entry_date_to`, `has_pending`, `has_active_listing`, and `has_active_service`. |
| Sorts cover days, update, entry date, price, brand/model, status | `sort` accepts `days_in_stock_desc`, `days_in_stock_asc`, `updated_at_desc`, `entry_date_desc`, `price_desc`, `price_asc`, `brand_model_asc`, and `status_asc`. |
| Active listing indicator exists | List items return `hasActiveListing` and `activeListingsCount`; detail returns `activeListings`. |
| Active service/preparation indicator exists | List/detail items return `hasActiveService` and `activeService` for non-terminal service orders, including expected return when available. |
| Relevant pending indicator exists | List items return `hasRelevantPending` and `pendingSummary`. |
| Cost fields are permission-protected | `purchaseCost` is returned only when the user has `inventory:read_costs`. |
| Status updates are audited | Inventory updates write `auditLog` entries and `vehicleStatusHistory` on status changes. |
| Screen states exist | The stock workspace shows loading, fallback, error, locked, and empty states. |

## Automated Coverage

`tests/auth-api-smoke.ts` covers:

- owner and seller inventory access;
- seller cost masking;
- repasse exclusion;
- removed inventory default exclusion;
- days-in-stock sort;
- brand/model and status sorting;
- responsible/origin/location/pending/listing/service filters;
- entry-period filter;
- active listing indicator and detail;
- active service indicator/detail with expected return;
- summary counts for ownership, statuses, active listings, and active services;
- status-change audit log.

Project-wide validation commands used for this story:

- `npm run typecheck`
- `npm run build:web`
- `npm test`

## Explicit Deferred Fields

The following S1-US04 fields are intentionally not implemented yet because the current schema does not store enough data for them:

| Deferred field/filter | Current status | Next required work |
|---|---|---|
| primary photo URL | Not present on vehicle/inventory. Attachments exist as documents. | Add photo attachment classification or a primary media relation. |

## BMAP Note

Responsible/origin/location filters are complete after migration `20260617120000_add_inventory_operational_fields`. Service return forecast is complete after migration `20260617121000_add_service_expected_return`. Do not mark primary photo as complete until its data field exists in the model, API, UI, and smoke coverage.
