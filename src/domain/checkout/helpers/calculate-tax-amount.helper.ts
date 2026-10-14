/**
 * Umsatzsteuer auf eine Nettosumme in Cent – **identisch zu EÜRwerk**
 * (`calculate-totals-net.helper.ts`: `Math.round(netCents * (rate / 100))`), damit der eingezogene
 * Betrag exakt dem Rechnungsbetrag entspricht. Der Shop muss für die Anzeige dieselbe Formel nutzen.
 */
export const calculateTaxAmount = (netAmount: number, taxRate: number): number =>
	Math.round(netAmount * (taxRate / 100));
