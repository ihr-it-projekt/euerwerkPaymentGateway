# EÜRwerk Payment Gateway

Zustandsloser Hono-Service zwischen **TBShop** und **EÜRwerk** (Buchhaltung). Löst BillDynamics im
Shop ab, bindet **Stripe**, **PayPal** und **Wero** (über Stripe) an und verbucht bezahlte
Bestellungen automatisch in EÜRwerk (Rechnung brutto → festschreiben → Zahlung buchen).

- **Keine Datenhaltung:** Der Shop sendet den EÜRwerk-API-Key (`Authorization: Bearer ewk_live_…`);
  Provider-Zugangsdaten kommen pro Request aus EÜRwerk, Checkout-Daten liegen beim Provider,
  Idempotenz stellt EÜRwerk über externe Referenzen sicher.
- **Webhooks:** `/v1/webhooks/<stripe|paypal>/<verschlüsselter Key>`; schlägt die Buchung fehl,
  antwortet das Gateway mit 5xx und der Provider wiederholt den Webhook.
- API-Doku: `GET /docs` (Scalar) bzw. `GET /openapi.json`

## Schnellstart

```bash
npm install
cp .env.example .env            # ENCRYPTION_KEY setzen, EUERWERK_API_BASE prüfen
npm run dev                     # http://localhost:3100/docs
```

Node ≥ 26 – TypeScript wird nativ ausgeführt, es gibt keinen Build-Schritt und keine Datenbank.

## Skripte

| Skript                     | Zweck                                                   |
| -------------------------- | ------------------------------------------------------- |
| `npm run check`            | Typecheck + Prettier + ESLint + alle Tests mit Coverage |
| `npm test`                 | Unit- und Integrationstests                             |
| `npm run test:unit`        | nur Unit-Tests (`src/**/*.spec.ts`)                     |
| `npm run test:integration` | nur Integrationstests (`tests/integration`)             |

## Dokumentation

- [docs/CODE_QUALITY.md](docs/CODE_QUALITY.md) – verbindliche Guidelines (Komplexität ≤ 5, Architektur, Tests)
- [docs/SHOP_INTEGRATION.md](docs/SHOP_INTEGRATION.md) – Einrichtung, Ablauf, Mapping von BillDynamics
- [docs/OPEN_POINTS.md](docs/OPEN_POINTS.md) – offene Punkte (u.a. EÜRwerk `TASK-PGW-06`)

## Tests & Mockserver

Alle ausgehenden REST-Calls (EÜRwerk, Stripe, PayPal) werden in Tests vom **MSW-Mockserver** in
[tests/mock-server](tests/mock-server) beantwortet; nicht gemockte Requests schlagen fehl. Die Mocks
halten Zustand wie die echten Systeme (Mandanten, Sessions, Orders, Rechnungen), damit
Integrationstests den kompletten zustandslosen Ablauf prüfen können.
