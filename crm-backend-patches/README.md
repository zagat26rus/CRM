# CRM backend patches (Black CRM / www.fedfix.ru)

Deployed to `/var/www/black-crm/back` on `45.8.230.220`.

## Changes
- `shop.js` — POS sale from warehouse (`POST /api/shop/sales`), catalog from inventory (`GET /api/shop/catalog`), inventory categories for shop filters, stock write-off + income/expense payments + printable invoice payload.
- `inventory.js` — fix missing `customer`/`shopOrderId` columns; payments include `method`.
- `database.js` — migrate `inventory_sales.customer`, `inventory_sales.shopOrderId`.
- `routes/aiAgent.js` — authenticated multi-turn DeepSeek diagnostics and supplier-backed parts search, plus IMEI/TAC lookup.
- `routes/orders-device-storage.patch` — persist storage/capacity discovered by IMEI lookup.
- `frontend-restore/AiAssistant.tsx` — floating diagnostic/parts chat.
- `frontend-restore/styles.css` and `mobile-pages.patch` — fixed mobile shell and contained wide page content.

DeepSeek uses the existing `aiPartsSearch.llm` company settings. Optional external IMEI lookup is configured with
`IMEI_LOOKUP_URL` and `IMEI_LOOKUP_KEY`; without it, the route uses the local `imei_tac` table and reports when a
TAC is unknown. Full IMEI values are not stored in the cache.

Frontend live: `/var/www/black-crm/front/src/pages/Shop.tsx` (mirrored in repo `src/pages/Shop.tsx`).
