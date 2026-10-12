# Shop-Anbindung (Ablösung von BillDynamics im TBShop)

## Ablauf

```
Shop                        Gateway                      Stripe/Wero / PayPal      EÜRwerk
 │ POST /v1/checkouts ─────▶ │ Checkout PENDING speichern     │                      │
 │                           │ Session/Order anlegen ───────▶ │                      │
 │ ◀── 201 { redirectUrl } ──│                                │                      │
 │ redirect Kunde ──────────────────────────────────────────▶ │                      │
 │                           │ ◀─ Webhook (signiert) ──────── │                      │
 │                           │ Status setzen, ggf. capture ─▶ │                      │
 │                           │ Kontakt/Rechnung/Festschreiben/Zahlung buchen ──────▶ │
 │ ◀─ POST Shop-Webhook ─────│ (X-Gateway-Signature)          │                      │
 │ GET /v1/checkouts/:id ──▶ │ (optional, Status-Polling)     │                      │
```

## 1. Merchant anlegen (einmalig pro Publisher)

```http
POST /v1/admin/merchants
Authorization: Bearer <ADMIN_API_KEY>

{
  "name": "Publisher XY",
  "shopWebhookUrl": "https://www.themodbase.com/api/payment-gateway/webhook",
  "stripe":     { "secretKey": "sk_live_…", "webhookSecret": "whsec_…" },
  "paypal":     { "clientId": "…", "clientSecret": "…", "webhookId": "…" },
  "wero":       { "acquirer": "stripe" },
  "accounting": { "apiToken": "<EÜRwerk Bearer-Token>" }
}
```

Alle Provider-Blöcke sind optional. Ein Checkout mit einem nicht konfigurierten Provider liefert
`422 PROVIDER_NOT_CONFIGURED`.

Antwort (einmalig!): `apiKey`, `webhookSigningSecret` und `providerWebhookUrls`. Die
Provider-Webhook-URLs werden im Stripe- bzw. PayPal-Dashboard hinterlegt:

- Stripe-Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`
- PayPal-Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`,
  `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`

Im Shop ersetzen diese Werte `Publisher.billDynamicsApiKey`.

### Wero

Wero (EPI) bietet keine eigene Händler-API, sondern wird über einen Acquirer angebunden – hier
über **Stripe**. Voraussetzungen:

- `stripe`-Credentials sind gesetzt (sonst lehnt die Admin-API `wero` mit 400 ab).
- Wero ist im [Stripe-Dashboard](https://dashboard.stripe.com/settings/payment_methods) des
  Publishers aktiviert (Stripe-Account in einem EWR-Land).
- Kein eigener Webhook nötig: Wero-Zahlungen melden sich über die **Stripe-Webhook-URL**.

Einschränkungen (Stripe/Wero): nur **EUR**, Mindestbetrag **0,50 €**, nur Einmalzahlungen.
Verstöße liefern `400 VALIDATION_FAILED`, bevor Stripe aufgerufen wird. Die Zahlung wird sofort
bestätigt (Kunde gibt in der Wero-App frei). In EÜRwerk wird sie als `BANK_TRANSFER` gebucht.

## 2. Checkout anlegen

```http
POST /v1/checkouts
Authorization: Bearer <apiKey>

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

`provider`: `stripe` | `paypal` | `wero`. `unitAmount` ist der **Bruttopreis in Cent**
(BillDynamics: Brutto in EUR).
Die Antwort enthält `id` (→ `Transaction.externalTransactionId`) und `redirectUrl`.

## 3. Shop-Webhook empfangen

Das Gateway sendet `POST shopWebhookUrl` mit:

```json
{ "id": "<eventId>", "type": "checkout.succeeded", "createdAt": "…", "data": { …Checkout… } }
```

| `type`                | Bedeutung im Shop (bisher `checkHasUpdateState`) |
| --------------------- | ------------------------------------------------ |
| `checkout.succeeded`  | SUCCESS → Lizenzen aktivieren                    |
| `checkout.processing` | DELAYED                                          |
| `checkout.failed`     | FAILED                                           |
| `checkout.expired`    | FAILED / Pending-Transaktion aufräumen           |

**Signatur prüfen** (ersetzt die IP-Allowlist `BILLDYNAMICS_SERVER_IP_V4/V6`):
Header `X-Gateway-Signature: t=<unix>,v1=<hex>` mit
`hex = HMAC-SHA256(webhookSigningSecret, "<t>.<rawBody>")`. Referenzimplementierung zum Kopieren:
[verify-webhook-signature.helper.ts](../src/shared/crypto/verify-webhook-signature.helper.ts).
Events können (bei Retries) mehrfach kommen → im Shop idempotent über `data.id` + `type` verarbeiten.

## Mapping BillDynamics → Gateway

| BillDynamics (TBShop)                                | Gateway                                                |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `POST /customers`, `PATCH /customer/:id/*`           | entfällt – Kunde wird pro Checkout mitgesendet         |
| `POST /invoices` + `POST /invoice/:id/checkout`      | `POST /v1/checkouts` (ein Call, ein Provider)          |
| `GET /invoice/:id`                                   | `GET /v1/checkouts/:id`                                |
| Webhook `/api/billdynamics/paymentState`             | Shop-Webhook (HMAC-signiert)                           |
| Header `Authentication: <key>`                       | `Authorization: Bearer <apiKey>`                       |
| sevdesk-Sync                                         | EÜRwerk-Buchung (Rechnung + Zahlung)                   |
| `GET /invoice/:id/pdf`, `GET /customer/:id/invoices` | **noch offen**, siehe [OPEN_POINTS.md](OPEN_POINTS.md) |
