# Code-Quality-Guidelines

Verbindlich für allen Code in diesem Repository. Alles, was automatisiert prüfbar ist, wird durch
`npm run check` (Typecheck → Prettier → ESLint → Tests mit Coverage) erzwungen. Ein PR ist erst
mergebar, wenn `npm run check` grün ist.

## 1. Komplexität (hart, per ESLint)

| Regel                    | Grenze | Warum                                             |
| ------------------------ | ------ | ------------------------------------------------- |
| `complexity`             | **5**  | Jede Funktion bleibt mit ≤ 5 Testfällen abdeckbar |
| `max-depth`              | 3      | Keine tief verschachtelten Blöcke                 |
| `max-params`             | 4      | Mehr Parameter → Objekt übergeben                 |
| `max-lines-per-function` | 40     | Funktion passt auf einen Bildschirm (Tests: aus)  |
| `max-lines`              | 200    | Datei = eine Verantwortung                        |
| `max-nested-callbacks`   | 3      | Lesbarkeit von async-Code (Tests: 4)              |
| `no-nested-ternary`      | –      | Verschachtelte Ternaries sind nicht reviewbar     |

`&&`, `||`, `??`, `?.`, `? :`, `if`, `case`, `catch` und Schleifen zählen jeweils +1.
**`eslint-disable` für Komplexitätsregeln ist verboten.** Stattdessen refaktorieren:

- **Guard Clauses** statt `if/else`-Ketten (früh zurückkehren).
- **Lookup-Maps** statt `switch`/`if`-Kaskaden, z.B. `STATUS_RESOLVERS` in
  [map-stripe-event.helper.ts](../src/providers/stripe/map-stripe-event.helper.ts),
  `ALLOWED_TRANSITIONS` in [can-transition.helper.ts](../src/domain/checkout/helpers/can-transition.helper.ts).
- **Kleine Helper extrahieren**, z.B. die `header()`-Closure in
  [paypal.provider.ts](../src/providers/paypal/paypal.provider.ts) statt fünf `??`.
- **Private Methoden** (`#method`) in Actions für Teilschritte.

## 2. Architektur

```
src/
  domain/<bereich>/
    models/    Zod-Schemas, Typen, Ports (Interfaces für externe Systeme)
    helpers/   reine Funktionen – genau eine exportierte Funktion pro Datei
    actions/   Use-Cases – eine Klasse mit genau einer öffentlichen Methode execute()
  providers/   Adapter nach außen (EÜRwerk, Stripe, PayPal, Wero) – implementieren Ports
  http/        Hono-Routen, Middleware, Error-Mapping – keine Fachlogik
  shared/      fachfreie Bausteine (Crypto, Logger, fetch-Wrapper, Fehler)
  composition-root.ts  einziger Ort, an dem verdrahtet wird
```

Abhängigkeitsrichtung: `http → domain ← providers`. Die Domain importiert **nie** aus `http`,
`providers`, Hono, Stripe-SDK o.ä.

**Zustandslos:** Das Gateway hat keine Datenbank und keinen Cache. Mandanten-Konfiguration kommt
pro Request aus EÜRwerk (API-Key des Shops), Checkout-Daten liegen beim Zahlungsanbieter
(Metadaten), Idempotenz stellt EÜRwerk über externe Referenzen sicher. Neue Features dürfen
keinen Zustand im Gateway einführen – Daten gehören zum Provider oder nach EÜRwerk.

- **Dependency Injection über den Konstruktor** (`deps`-Objekt); keine Singletons, keine globalen
  Imports von Clients in Actions.
- **Ports first:** Neue externe Systeme bekommen zuerst ein Interface in `domain/*/models/*.port.ts`.
- **Neuer Zahlungsanbieter** = neuer Ordner in `providers/` mit einem `PaymentProvider`
  (Checkout anlegen, optional `assertEligible` für Provider-Vorgaben), Eintrag in
  `ProviderNameSchema` + Registry in `composition-root.ts`. Kommen die Statusmeldungen über einen
  neuen Kanal, zusätzlich ein `WebhookProcessor` + Eintrag in `WebhookSourceSchema`. Läuft der
  Anbieter über einen bestehenden Acquirer (z.B. Wero über Stripe), genügt `webhookSource` auf
  dessen Kanal. Die Domain bleibt unverändert.

## 3. TypeScript

- `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly` (Node führt `.ts` direkt aus).
  → Keine `enum`s, keine `namespace`s, keine Constructor-Parameter-Properties.
- `any` ist verboten; `unknown` + Zod-Parsing an Systemgrenzen.
- Non-Null-Assertions (`!`) sind im Produktivcode verboten (in Tests erlaubt).
- Exportierte Funktionen haben explizite Rückgabetypen.
- Imports mit `.ts`-Endung; `import type` für reine Typen.
- Private Felder mit `#` (echte Laufzeit-Privatsphäre).

## 4. Validierung & Fehler

- **Jede externe Eingabe wird mit Zod validiert**: HTTP-Requests, Webhook-Payloads,
  Antworten von Stripe/PayPal/EÜRwerk, ENV-Variablen, entschlüsselte Credentials.
- Fachliche Fehler: `throw new DomainError(code, message)`. Das HTTP-Mapping passiert zentral in
  [error-handler.ts](../src/http/error-handler.ts). Routen enthalten kein `try/catch`.
- Unbekannte Fehler → 500 ohne Details nach außen, vollständig ins Log.

## 5. Sicherheit

- Das Gateway speichert keine Secrets. Provider-Credentials liegen verschlüsselt in EÜRwerk und
  werden nur für die Dauer eines Requests im Speicher gehalten.
- Der EÜRwerk-API-Key in Webhook-URLs ist **AES-256-GCM verschlüsselt** (`ENCRYPTION_KEY`).
- Werte aus Requests, die in Provider-URLs landen (Checkout-ID, Order-ID), werden strikt
  validiert (Allowlist-Regex).
- Eingehende Webhooks werden **immer** signaturgeprüft (Stripe: HMAC, PayPal: Verify-API).
- PayPal-Orders/Stripe-Sessions ohne Gateway-Kennzeichnung werden nie captured oder gebucht.
- Vergleiche von Secrets nur mit `timingSafeEqual`.
- Keine Secrets in Logs (Kontext-Objekte bewusst wählen).

## 6. Tests

| Art         | Ort                                  | Werkzeug | Was                             |
| ----------- | ------------------------------------ | -------- | ------------------------------- |
| Unit        | `src/**/*.spec.ts` (neben dem Code)  | Vitest   | Helper, Actions, Adapter        |
| Integration | `tests/integration/**/*.int.spec.ts` | Vitest   | Ganze App über `app.request()`  |
| HTTP-Mocks  | `tests/mock-server/`                 | MSW      | **alle** ausgehenden REST-Calls |

- **Alle REST-Calls laufen gegen den MSW-Mockserver.** `onUnhandledFrame: 'error'` lässt jeden
  nicht gemockten Request scheitern – Tests haben keinen Netzwerkzugriff.
- Neuer externer Endpunkt → Default-Handler in `tests/mock-server/handlers/<system>.handlers.ts`
  (mit `recorded(...)` für Assertions über `requestLog`). Fehlerfälle als exportierte Factory,
  im Test via `mockServer.use(...)`.
- Die Mocks sind **zustandsbehaftet** wie die echten Systeme (EÜRwerk-Mandanten, Stripe-Sessions,
  PayPal-Orders) und über `euerwerkMock`, `stripeMock`, `paypalMock` steuerbar; Reset nach
  jedem Test.
- Unit-Tests von Actions nutzen `vi.fn()`-Fakes der Ports.
- **Testdaten mit `@faker-js/faker`** über die Factories in `tests/factories/`. Feste Werte nur,
  wenn sie für die Assertion relevant sind (z.B. Beträge für Rundungstests).
- Jeder Test enthält mindestens eine Assertion (`expect.requireAssertions`).
- Struktur: Arrange / Act / Assert, durch Leerzeilen getrennt. Testnamen beschreiben Verhalten.
- Coverage-Schwellen (CI-bindend): Lines/Statements/Functions 85 %, Branches 80 %.
- **TDD:** Bugfix = zuerst ein fehlschlagender Test.

## 7. Stil

- Prettier (Tabs, Single Quotes, kein Trailing Comma, 100 Zeichen) – nicht diskutieren, formatieren.
- Dateinamen kebab-case mit Rollen-Suffix: `*.action.ts`, `*.helper.ts`, `*.schema.ts`,
  `*.port.ts`, `*.repository.ts`, `*.provider.ts`, `*.routes.ts`, `*.middleware.ts`.
- Fachsprache in Kommentaren und Fehlermeldungen: Deutsch. Bezeichner: Englisch.
- Kommentare erklären das **Warum**, nicht das Was.
- Kein `console.*` außer im Logger und in Startskripten.

## 8. API

- Jede öffentliche Route wird mit `@hono/zod-openapi` (`createRoute`) definiert und erscheint
  automatisch unter `/openapi.json` bzw. `/docs` (Scalar). Ausnahme: Provider-Webhooks (Raw-Body).
- Beträge immer als **Integer in Cent**, Währung als ISO-4217-Code.
- Fehlerformat: `{ "error": { "code": "...", "message": "...", "details"?: ... } }`.
- Versionierung über Pfad-Präfix (`/v1`).
