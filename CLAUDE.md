# CLAUDE.md

Zustandsloses Payment Gateway (Hono, Node 26, TypeScript ohne Build-Schritt) zwischen TBShop
(`D:\TBShop`) und EÜRwerk (`D:\Buchhaltung`). Ersetzt BillDynamics; Provider: Stripe, PayPal,
Wero (über Stripe als Acquirer).

## Pflicht

- Lies und befolge [docs/CODE_QUALITY.md](docs/CODE_QUALITY.md). Kernpunkte:
  - **Zyklomatische Komplexität ≤ 5** pro Funktion – refaktorieren (Guard Clauses, Lookup-Maps,
    Helper), niemals per `eslint-disable` umgehen.
  - **Keine Datenhaltung im Gateway** (keine DB, kein Cache). Konfiguration kommt aus EÜRwerk
    (API-Key des Shops), Checkout-Daten liegen beim Provider, Idempotenz über EÜRwerk-Referenzen.
  - Domain (`src/domain`) ist framework-frei; Actions = Klasse mit `execute()`; Helper = eine
    Funktion pro Datei; Ports als Interfaces; Verdrahtung nur in `src/composition-root.ts`.
  - Alle externen Eingaben/Antworten mit Zod validieren.
- **Jeder REST-Call nach außen muss im MSW-Mockserver (`tests/mock-server/handlers`) gemockt sein.**
- Neue Features: Unit-Test (neben dem Code, `*.spec.ts`) **und** Integrationstest
  (`tests/integration/*.int.spec.ts`). Testdaten über `tests/factories` (faker).
- Vor Abschluss: `npm run check` muss grün sein.

## Befehle

- `npm run check` – Typecheck, Prettier, ESLint, Tests + Coverage
- `npm run test:unit` / `npm run test:integration`

## Kontext

- EÜRwerk-API: `GET /payment-gateway/config` (TASK-PGW-06, noch offen), `POST /contacts`
  (`externalSource`/`externalId`), `POST /invoices` (`priceMode: 'GROSS'`, `externalReference`),
  `POST /invoices/:id/enshrine`, `POST /invoices/:id/book-amount` (`STRIPE`/`PAYPAL`/`WERO`).
- Shop-Anbindung: docs/SHOP_INTEGRATION.md · offene Punkte: docs/OPEN_POINTS.md
