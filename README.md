# EÜRwerk Payment Gateway

Hono-Service zwischen **TBShop** (D:\TBShop) und **EÜRwerk** (D:\Buchhaltung). Löst BillDynamics
im Shop ab, bindet **Stripe**, **PayPal** und **Wero** (über Stripe) an und verbucht bezahlte Bestellungen automatisch in
EÜRwerk (Kontakt → Rechnung → Festschreiben → Zahlung).

- Mandantenfähig: pro Publisher eigene Provider-Credentials (verschlüsselt) und eigener API-Key
- Shop → Gateway: `Authorization: Bearer <apiKey>`; Gateway → Shop: HMAC-signierte Webhooks
- API-Doku: `GET /docs` (Scalar) bzw. `GET /openapi.json`

## Schnellstart

```bash
npm install
cp .env.example .env            # ENCRYPTION_KEY und ADMIN_API_KEY setzen
docker compose up -d            # Postgres auf :5434
npm run db:migrate
npm run dev                     # http://localhost:3100/docs
```

Node ≥ 26 – TypeScript wird nativ ausgeführt, es gibt keinen Build-Schritt.

## Skripte

| Skript                     | Zweck                                                    |
| -------------------------- | -------------------------------------------------------- |
| `npm run check`            | Typecheck + Prettier + ESLint + alle Tests mit Coverage  |
| `npm test`                 | Unit- und Integrationstests                              |
| `npm run test:unit`        | nur Unit-Tests (`src/**/*.spec.ts`)                      |
| `npm run test:integration` | nur Integrationstests (`tests/integration`)              |
| `npm run db:generate`      | Migration aus `src/infrastructure/db/schema.ts` erzeugen |
| `npm run db:migrate`       | Migrationen ausführen                                    |

## Dokumentation

- [docs/CODE_QUALITY.md](docs/CODE_QUALITY.md) – verbindliche Guidelines (Komplexität ≤ 5, Architektur, Tests)
- [docs/SHOP_INTEGRATION.md](docs/SHOP_INTEGRATION.md) – Anbindung TBShop, Mapping von BillDynamics
- [docs/OPEN_POINTS.md](docs/OPEN_POINTS.md) – offene Punkte / nächste Schritte

## Tests & Mockserver

Alle ausgehenden REST-Calls (Stripe, PayPal, EÜRwerk, Shop) werden in Tests vom
**MSW-Mockserver** in [tests/mock-server](tests/mock-server) beantwortet; nicht gemockte Requests
schlagen fehl. Integrationstests starten die komplette App mit einer In-Process-Postgres (PGlite)
und den echten Migrationen – Docker ist für Tests nicht nötig.
