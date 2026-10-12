# Offene Punkte

Bewusst nicht im ersten Schritt umgesetzt bzw. abhängig von Änderungen in EÜRwerk/TBShop.

## EÜRwerk (Buchhaltung)

1. **API-Token für Service-Zugriffe** – EÜRwerk akzeptiert aktuell nur Session-Tokens
   (`TASK-API-TOKEN-01`). Bis dahin muss `accounting.apiToken` ein Session-Token sein.
2. **Mandantenprüfung bei `book-amount`** – die Route reicht `locals.clientId` nicht an die Action
   weiter. Vor Produktivbetrieb in EÜRwerk prüfen/fixen.
3. **Bruttopreise** – EÜRwerk erwartet Netto-`unitPrice`. Das Gateway rechnet Brutto→Netto mit
   4 Nachkommastellen; Rundungsdifferenzen von ±1 Cent sind möglich (z.B. 9,99 € bei 19 %).
   Das Gateway loggt eine Warnung. Saubere Lösung: Brutto-Positionen in EÜRwerk unterstützen.
4. **Rechnungs-PDF** – BillDynamics lieferte `GET /invoice/:id/pdf`. EÜRwerk hat noch keinen
   PDF-Endpunkt; danach `GET /v1/checkouts/:id/invoice.pdf` im Gateway als Proxy ergänzen.
5. **Gebühren** – Stripe/PayPal-Gebühren als Ausgabe-Beleg buchen (`TASK-BNK-STRIPE-01`).
6. **Contact-Zuordnung** – EÜRwerk hat keine Suche nach externer Kunden-ID; das Gateway speichert
   die Zuordnung selbst (`accounting_contacts`). Alternativ Custom-Field in EÜRwerk nutzen.

## Gateway

7. **Outbox für Shop-Webhooks und Buchungen** – fehlgeschlagene Zustellungen werden derzeit nur
   geloggt (`accountingStatus=FAILED`, Shop-Webhook-Fehler). Nächster Schritt: Outbox-Tabelle +
   Retry mit Backoff + Admin-Endpunkt zum erneuten Auslösen.
8. **PayPal-Access-Token cachen** – aktuell ein Token-Request pro Vorgang.
9. **Erstattungen (Refunds)** und Gutschriften in EÜRwerk (`credit-notes`).
10. **Publisher-Fee-Rechnungen** (monatlicher Billing-Run im Shop) – bisher über BillDynamics mit
    `metaData.type=publisherFee`; im Gateway als eigener Merchant „Shop-Betreiber" abbildbar,
    Fachlogik klären.
11. **Rabatte** (`discount` bei BillDynamics) – aktuell als negative Position nicht erlaubt.
12. **Admin-API** – Merchant ändern/deaktivieren, API-Key rotieren.
13. **Rate-Limiting & Request-IDs** im HTTP-Layer, Metriken.

## Wero

14. **Weitere Acquirer** – Wero läuft aktuell nur über Stripe. Für Nexi, PAYONE, Worldline oder
    eine direkte EPI-Anbindung: neuer Wert in `WeroSettingsSchema.acquirer`, eigener
    `PaymentProvider` und ggf. ein neuer `WebhookProcessor`. Achtung: `webhookSource` ist derzeit
    pro Provider fest – mit mehreren Acquirern muss sie pro Merchant aufgelöst werden.
15. **Eigene Zahlungsart in EÜRwerk** – Wero wird als `BANK_TRANSFER` gebucht; für eine saubere
    Auswertung `WERO` in EÜRwerks `PaymentMethodSchema` ergänzen.
16. **Wero im Stripe-Provider** – der `stripe`-Provider nutzt die im Stripe-Dashboard aktivierten
    Zahlungsarten (dynamisch). Ist Wero dort aktiv, kann ein Kunde Wero auch über `provider=stripe`
    wählen (wird dann als `CREDIT_CARD` gebucht). Falls unerwünscht: `stripe`-Provider per
    `excluded_payment_method_types: ['wero']` einschränken.
17. **Sandbox-Test** – Integration ist nur gegen den Mockserver getestet; vor Go-live einmal mit
    Stripe-Testmodus (Wero-Testseite: Genehmigen/Ablehnen) durchspielen.
