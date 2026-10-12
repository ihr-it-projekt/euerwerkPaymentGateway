const PRECISION = 10_000;

/**
 * Brutto-Cent → Netto-EUR mit 4 Nachkommastellen.
 * EÜRwerk erwartet Nettopreise; Rundungsdifferenzen von ±1 Cent auf die Rechnungssumme sind
 * möglich und werden in BookCheckoutInAccountingAction geloggt (siehe docs/OPEN_POINTS.md).
 */
export const toNetUnitPrice = (grossMinor: number, taxRate: number): number =>
	Math.round((grossMinor / 100 / (1 + taxRate / 100)) * PRECISION) / PRECISION;
