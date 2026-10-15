# CRM backend patches (Black CRM / www.fedfix.ru)

Deployed to `/var/www/black-crm/back` on `45.8.230.220`.

## Changes
- `shop.js` — POS sale from warehouse (`POST /api/shop/sales`), catalog from inventory (`GET /api/shop/catalog`), inventory categories for shop filters, stock write-off + income/expense payments + printable invoice payload.
- `inventory.js` — fix missing `customer`/`shopOrderId` columns; payments include `method`.
- `database.js` — migrate `inventory_sales.customer`, `inventory_sales.shopOrderId`.

Frontend live: `/var/www/black-crm/front/src/pages/Shop.tsx` (mirrored in repo `src/pages/Shop.tsx`).
