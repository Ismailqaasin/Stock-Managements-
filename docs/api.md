# Data model and API contract

The later technical design takes precedence over the earlier single-line receipt / optional-order-return design. There is one real administrator, one settings row, no fake cash customer, and no hard-delete transaction endpoint.

## Data ownership

```text
categories ← products ← stock_in_items → stock_ins
                 ↑    ← stock_outs (sample/gift)
                 ↑    ← stock_adjustments
                 ↑    ← order_items → orders → customers (nullable for cash)
                 ↑           ↑           ↑
                 └──── return_items → returns
products ← stock_movements (signed append-only ledger)
admin_users ← refresh_tokens       audit_logs (append-only)
backups ← restore_logs             reference_counters(prefix,year)
```

`database/001_schema.sql`, `002_engine.sql`, `003_queries.sql` are embedded by the initial EF migration. Add **new migrations** for later schema changes; don't edit an applied migration in a deployed database. EF maps the entities and persists auth state. `StockService.Command` calls a parameterized PostgreSQL command inside a transaction. The sole balance writer, `stock_service`, conditionally changes stock and appends the movement and audit entry. Domain commands, not UI math, enforce all stock transitions.

Document writes acquire one transaction-scoped advisory lock. This deliberately prioritizes consistent reservations, returns, and yearly counters over write throughput for multiple warehouses. Movement identity is unique per source/type/product. Stock never goes below reserved units. Sequence gaps in database identity IDs are harmless; document counters increment in the document transaction. Product/order/return `xmin` is exposed as a string `version` for optimistic edits. Financial calculations use PostgreSQL `numeric(18,2)`, not JavaScript floating point. Ordinary product updates never set `current_stock`.

Append-only triggers reject update/delete/truncate on movements and audit logs. These are application integrity controls, not a defense against a database superuser with DDL privileges.

## HTTP

Base path `/api`. `Authorization: Bearer …` on protected requests. Browser refresh cookies are HttpOnly; `Accept-Language: en` or `so` selects PDF labels. The public config endpoint contains only mode flags. Development Swagger UI: `/swagger`, schema: `/swagger/v1/swagger.json` **on the API host**. Production does not expose Swagger by default.

| Resource | Operations |
|---|---|
| `/auth` | POST `login`, `refresh`, `logout`, `change-password`, `reset-password`; GET `me`, `config` |
| `/dashboard` | GET `summary`, `recent-activities`, `recent-movements` |
| `/products`, `/categories`, `/customers` | GET list/detail, POST create, PUT `/{id}`, PATCH `/{id}/status` with `is_active` |
| `/products/{id}` | GET `movements`, POST `image` (multipart field `file`) |
| `/customers/{id}/history` | GET paged `orders`, `returns`, `dispatches` |
| `/stock-ins` | GET list/detail, POST receipt, POST `/{id}/reverse` with reason |
| `/stock-outs` | GET list/detail, POST Sample/Gift, POST `/{id}/reverse` |
| `/dispatches` | GET unified Order/Cash/Sample/Gift outgoing lines, with `source_type` and `source_id` |
| `/stock-movements` | GET signed ledger, optional `direction=in/out`, `product_id`, `type` |
| `/orders` | GET list/detail, POST, PUT pending document; POST `/{id}/confirm`, `deliver`, `cancel` |
| `/returns` | GET list/detail, POST pending return; POST `/{id}/approve` or `reject` |
| `/stock-adjustments` | GET list/detail, POST counted quantity and reason |
| `/reports/{type}` | GET JSON, GET `/pdf` with the same filters |
| `/audit-logs` | GET list/detail/PDF |
| `/backups` | GET list/detail; POST queue archive; POST `/{id}/verify`, `/{id}/restore`; GET `/{id}/download` |
| `/settings` | GET, PUT, POST `/logo`, GET `/integrity-check` |
| `/{resource}/pdf`, `/{resource}/{id}/pdf` | GET list/document PDF |

Reports: `products`, `stock`, `low-stock`, `out-of-stock`, `stock-in`, `stock-out`, `orders`, `customers`, `returns`, `damaged-items`, `adjustments`, `ledger`, `audit`.

Lists accept `page`, `pageSize` (1–100), `q`, inclusive `from`/`to` and applicable status/type/customer/product/category filters. Response: `{items,page,pageSize,totalCount,totalPages}`. PDFs include **all matching pages**. Write responses include `id` and `reference_no` where applicable. Use an empty JSON object for transitions without additional fields. Missing or invalid records return 4xx problem details; internal traces aren't exposed. Stock and document field names are snake_case. Auth DTO inputs use camelCase (`currentPassword`, `newPassword`, `recoveryKey`).

### Workflow payloads

Replace the illustrative IDs with IDs actually returned by your API.

```json
POST /products
{"name":"Storage box","sku":"BOX-01","selling_price":"12.50"}

POST /stock-ins
{"source_name":"Supplier","items":[{"product_id":1,"quantity":12}]}

POST /orders
{"customer_type":"Cash","cash_customer_name":"Walk-in","confirm":true,"items":[{"product_id":1,"quantity":4,"unit_price":"12.50"}]}

POST /returns
{"order_id":1,"reason":"Unused","items":[{"order_item_id":1,"quantity":1,"condition":"Good"}]}

POST /returns/1/approve
{}

POST /stock-adjustments
{"product_id":1,"previous_quantity":9,"new_quantity":10,"reason":"Physical count"}
```

Missing `confirm` creates a Pending reservation. A registered order requires an active `customer_id`. Document dates default to the warehouse-local business date. Stock-In/Order/Return accept 1–100 lines. Supply the latest `version` from detail GET when editing. Archive/restore/cancel/return approval are explicit operations, never generic deletes.
