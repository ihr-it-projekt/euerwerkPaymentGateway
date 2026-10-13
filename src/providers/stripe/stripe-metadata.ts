/**
 * Reservierte Metadaten-Schlüssel – das Gateway speichert nichts, die Checkout-Daten
 * leben in der Stripe-Session (Session- bzw. Produkt-Metadaten).
 */
export const STRIPE_META = {
	provider: 'pgw_provider',
	reference: 'pgw_reference',
	contactId: 'pgw_contact_id',
	taxRate: 'pgw_tax_rate'
} as const;
