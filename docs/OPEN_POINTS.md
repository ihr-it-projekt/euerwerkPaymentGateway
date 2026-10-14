# Offene Punkte

## EÜRwerk (Buchhaltung)

1. **Zahlungs-Konfiguration** (`TASK-PGW-06`, **Blocker**) – `GET /api/v1/payment-gateway/config`
   inkl. verschlüsselter Ablage und Token-Scope `payment-gateway`. Das Gateway ist gegen diesen
   Vertrag gebaut und nur im Mockserver getestet.
2. **Gebühren** (`TASK-BNK-STRIPE-01`) – Stripe/PayPal-Gebühren als Ausgabe-Beleg buchen.
3. **Kontaktdaten-Aktualisierung** – `POST /contacts` mit bestehender externer Referenz liefert den
   Kontakt unverändert zurück. Geänderte Rechnungsadressen des Kunden landen so nicht in EÜRwerk
   (BillDynamics hat sie aktualisiert). Lösung in EÜRwerk: Upsert-Semantik oder `PATCH`.

## Gateway

- **Für den TBShop** (siehe `TBShop/todo/payment-gateway/`):
  - ✅ `GET /v1/providers`, feste Nettopreise (`unitNetAmount`) mit Steuer oben drauf (je Satz
    auf die Nettosumme, Rechnung in EÜRwerk mit `priceMode: 'NET'`), OSS-Sätze (0–30 %, 2
    Nachkommastellen) und Steuer-Infos (`tax.country`/`tax.regime` → EÜRwerk `taxCountry`/
    `taxRegime`) – umgesetzt 13.10.2026.
  - **PayPal-Sandbox prüfen:** Positionen netto ohne Steuer je Position, Steuer nur in
    `breakdown.tax_total`. Lehnt PayPal das ab (`TAX_TOTAL_MISMATCH`), die Steuer je Satz auf die
    Positionen verteilen (`items[].tax`, Restcent auf die letzte Position).
  - **Bestehende Rechnung bezahlen** – Checkout mit `invoiceId` einer bereits festgeschriebenen
    EÜRwerk-Rechnung (Publisher-Gebühren); nach Zahlung nur `book-amount`, keine zweite Rechnung.
    Nur nötig, wenn der Shop Gebühren über EÜRwerk abrechnet (Shop-Task 00/08).
  - **`externalReference` im EÜRwerk-Webhook** – EÜRwerk `TASK-PGW-07`.
  - **Steuersatz nicht gegengeprüft** – das Gateway übernimmt Satz/Regime vom Shop (der den Key
    des Mandanten hat). Optional: Satz beim Checkout selbst bei EÜRwerk (`GET /tax/rate`)
    verifizieren.
  - **EÜRwerk muss OSS-Sätze und `taxCountry`/`taxRegime` annehmen** (`TASK-PGW-08`) – bis dahin
    lehnt EÜRwerk Rechnungen mit anderen Sätzen als 0/7/19 ab (Buchung → 502, Provider-Retry).

4. **Kein Statuswechsel ohne Buchung sichtbar für den Shop** – fehlgeschlagene/abgelaufene
   Zahlungen erzeugen keinen EÜRwerk-Webhook. Der Shop erfährt sie über `GET /v1/checkouts/:id`
   (Rücksprung/Cronjob für Pending-Transaktionen).
5. **Buchung bei Statusabfrage** – geht ein Provider-Webhook endgültig verloren (Provider gibt nach
   ca. 3 Tagen auf), wird nicht gebucht. Option: `POST /v1/checkouts/:id/sync` bucht idempotent,
   wenn der Provider `SUCCEEDED` meldet.
6. **Stripe: asynchron fehlgeschlagene Zahlungen** – `GET` zeigt dafür `PROCESSING`
   (Session `complete`/`unpaid`); genauer wäre ein Blick auf den PaymentIntent.
7. **PayPal-Access-Token cachen** – aktuell ein Token-Request pro Vorgang (bewusst ohne Zustand).
8. **Erstattungen (Refunds)** und Gutschriften in EÜRwerk (`credit-notes`).
9. **Publisher-Fee-Rechnungen** (monatlicher Billing-Run im Shop) – Fachlogik klären.
10. **Rabatte** (`discount` bei BillDynamics) – negative Positionen sind nicht erlaubt.
11. **Rate-Limiting & Request-IDs** im HTTP-Layer, Metriken.
12. **Key-Rotation** – Webhook-URLs enthalten den EÜRwerk-Key verschlüsselt; nach Rotation müssen
    sie in Stripe/PayPal neu eingetragen werden. Ein Wechsel von `ENCRYPTION_KEY` macht alle URLs
    ungültig (ggf. Unterstützung für zwei Schlüssel während der Umstellung).

## Wero

13. **Weitere Acquirer** – Wero läuft aktuell nur über Stripe. Für Nexi, PAYONE, Worldline oder
    eine direkte EPI-Anbindung: neuer Wert in `WeroSettingsSchema.acquirer`, eigener
    `PaymentProvider` und ggf. ein neuer `WebhookProcessor`. `webhookSource` ist derzeit pro
    Provider fest – mit mehreren Acquirern muss sie pro Mandant aufgelöst werden.
14. **Wero im Stripe-Provider** – der `stripe`-Provider nutzt die im Stripe-Dashboard aktivierten
    Zahlungsarten. Ist Wero dort aktiv, kann ein Kunde Wero auch über `provider=stripe` wählen
    (Buchung als `STRIPE`). Falls unerwünscht: `excluded_payment_method_types: ['wero']`.

## Vor Go-live

15. **Sandbox-Test** – Integration ist nur gegen den Mockserver getestet; einmal mit Stripe-Testmodus
    (inkl. Wero-Testseite), PayPal-Sandbox und echtem EÜRwerk durchspielen.
