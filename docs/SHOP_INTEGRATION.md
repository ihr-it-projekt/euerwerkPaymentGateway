# Shop-Anbindung (Ablösung von BillDynamics im TBShop)

Das Gateway ist **zustandslos**. Merchant = EÜRwerk-Mandant. Der Shop sendet bei jedem Request den
EÜRwerk-API-Key des Publishers; alles Weitere (Provider-Zugangsdaten, Buchhaltung) liegt in EÜRwerk,
die Checkout-Daten beim Zahlungsanbieter.

## Ablauf

```
Shop                     Gateway                         EÜRwerk              Stripe / PayPal
 │ POST /v1/checkouts ──▶ │ GET /payment-gateway/config ─▶ │                      │
 │  (Bearer ewk_live_…)   │ POST /contacts (idempotent) ──▶ │                      │
 │                        │ Session/Order anlegen (Daten als Metadaten) ─────────▶ │
 │ ◀── 201 {id, redirectUrl}                              │                      │
 │ Kunde → redirectUrl ──────────────────────────────────────────────────────────▶ │
 │                        │ ◀── Webhook /v1/webhooks/<kanal>/<verschl. Key> ────── │
 │                        │ Config laden, Signatur prüfen, ggf. capturen ────────▶ │
 │                        │ Rechnung (GROSS, externalReference) → festschreiben → buchen ─▶ │
 │ ◀──────────── EÜRwerk-Webhook invoice.paid ────────────│                      │
 │ GET /v1/checkouts/:id ▶ │ Live-Status beim Provider ──────────────────────────▶ │
```

## 1. Einrichtung pro Publisher

1. In EÜRwerk Stripe-/PayPal-/Wero-Daten hinterlegen und ein API-Token für den Shop erzeugen
   (TASK-PGW-06, Scope `payment-gateway`). Das Token ersetzt `Publisher.billDynamicsApiKey`.
2. Webhook-URLs beim Gateway abrufen und im Stripe- bzw. PayPal-Dashboard eintragen:

   ```http
   GET /v1/webhook-endpoints
   Authorization: Bearer ewk_live_…

   → { "stripe": "https://gateway/v1/webhooks/stripe/v1.…", "paypal": "https://gateway/v1/webhooks/paypal/v1.…" }
   ```

   Die URL enthält den API-Key **verschlüsselt** (AES-256-GCM). Nach einer Token-Rotation in
   EÜRwerk oder einem Wechsel von `ENCRYPTION_KEY` im Gateway müssen die URLs neu eingetragen werden.
   - Stripe-Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`
   - PayPal-Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`,
     `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`

3. Im EÜRwerk-Webhook-Bereich einen Endpunkt für `invoice.paid` auf den Shop anlegen.

### Wero

Wero hat keine eigene Händler-API und läuft über **Stripe** als Acquirer: Stripe-Daten müssen
hinterlegt und Wero im [Stripe-Dashboard](https://dashboard.stripe.com/settings/payment_methods)
aktiviert sein. Wero-Zahlungen melden sich über die **Stripe-Webhook-URL**. Einschränkungen: nur
**EUR**, Mindestbetrag **0,50 €** (sonst `400`, bevor Stripe aufgerufen wird).

## 2. Checkout anlegen

```http
POST /v1/checkouts
Authorization: Bearer ewk_live_…

{
  "provider": "paypal",
  "reference": "<Transaction.id im Shop>",
  "customer": { "id": "<customerId>", "email": "…", "firstName": "…", "lastName": "…",
                "address": { "line1": "…", "postalCode": "…", "city": "…", "country": "DE" } },
  "items": [{ "name": "Lizenz", "quantity": 1, "unitAmount": 1190, "taxRate": 19 }],
  "successUrl": "https://www.themodbase.com/checkout/approve/<transactionId>",
  "cancelUrl": "https://www.themodbase.com/checkout"
}
```

- `provider`: `stripe` | `paypal` | `wero`; `unitAmount` = **Bruttopreis in Cent**; `taxRate` 0/7/19.
- Antwort `201`: `id` (z.B. `paypal.5O190127TN364715T` → `Transaction.externalTransactionId`),
  `redirectUrl`, `status: PENDING`.
- Fehler: `401` Key ungültig/widerrufen · `422` Provider in EÜRwerk nicht eingerichtet · `400`
  Validierung · `502` EÜRwerk/Provider nicht erreichbar.

## 3. Ergebnis erfahren

| Weg                            | Wann                                                          |
| ------------------------------ | ------------------------------------------------------------- |
| `GET /v1/checkouts/:id`        | Beim Rücksprung auf `successUrl` bzw. für Pending-Aufräumjobs |
| EÜRwerk-Webhook `invoice.paid` | Gebuchte Zahlung; `externalReference` = Checkout-`id`         |

`status`: `PENDING` (Kunde zahlt noch) · `PROCESSING` (freigegeben/asynchron) · `SUCCEEDED` ·
`FAILED` · `EXPIRED`. Mapping auf `checkHasUpdateState`: SUCCEEDED → SUCCESS, PROCESSING → DELAYED,
FAILED/EXPIRED → FAILED.

## Mapping BillDynamics → Gateway

| BillDynamics (TBShop)                           | Gateway / EÜRwerk                                  |
| ----------------------------------------------- | -------------------------------------------------- |
| `POST /customers`, `PATCH /customer/:id/*`      | entfällt – Kunde wird pro Checkout mitgesendet     |
| `POST /invoices` + `POST /invoice/:id/checkout` | `POST /v1/checkouts` (ein Call)                    |
| `GET /invoice/:id`                              | `GET /v1/checkouts/:id`                            |
| Webhook `/api/billdynamics/paymentState`        | EÜRwerk-Webhook `invoice.paid` (HMAC-signiert)     |
| Header `Authentication: <key>`                  | `Authorization: Bearer ewk_live_…` (EÜRwerk-Token) |
| `GET /invoice/:id/pdf`                          | EÜRwerk `GET /api/v1/invoices/:id/pdf`             |
| sevdesk-Sync                                    | Buchung direkt in EÜRwerk                          |
