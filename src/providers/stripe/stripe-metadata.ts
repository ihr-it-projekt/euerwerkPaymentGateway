/**
 * Reservierte Metadaten-Schlüssel – das Gateway speichert nichts, die Checkout-Daten
 * leben in der Stripe-Session (Session- bzw. Produkt-Metadaten).
 */
export const STRIPE_META = {
	provider: 'pgw_provider',
	reference: 'pgw_reference',
	contactId: 'pgw_contact_id',
	taxCountry: 'pgw_tax_country',
	taxRegime: 'pgw_tax_regime',
	amountNet: 'pgw_amount_net',
	taxRate: 'pgw_tax_rate',
	/** `tax` = Steuerzeile (nicht als Rechnungsposition übernehmen) */
	kind: 'pgw_kind'
} as const;
