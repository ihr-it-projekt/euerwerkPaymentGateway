import { z } from 'zod';

export const ProviderNameSchema = z.enum(['stripe', 'paypal', 'wero']);
export type ProviderName = z.infer<typeof ProviderNameSchema>;

/** Webhook-Kanäle (Acquirer/PSP-Accounts), über die Zahlungsstatus eintreffen. */
export const WebhookSourceSchema = z.enum(['stripe', 'paypal']);
export type WebhookSource = z.infer<typeof WebhookSourceSchema>;

export const CheckoutStatusSchema = z.enum([
	'PENDING',
	'PROCESSING',
	'SUCCEEDED',
	'FAILED',
	'EXPIRED'
]);
export type CheckoutStatus = z.infer<typeof CheckoutStatusSchema>;

/** Steuersatz in Prozent, max. 2 Nachkommastellen (OSS: z.B. AT 20, FI 25.5, HU 27). */
export const TaxRateSchema = z
	.number()
	.min(0)
	.max(30)
	.refine((rate) => Math.abs(rate * 100 - Math.round(rate * 100)) < 1e-9, {
		message: 'Steuersatz mit höchstens 2 Nachkommastellen'
	});
export type TaxRate = z.infer<typeof TaxRateSchema>;

/** Steuerliche Einordnung laut EÜRwerk (`GET /api/v1/tax/rate`, TASK-PGW-08). */
export const TaxRegimeSchema = z.enum([
	'DOMESTIC',
	'OSS',
	'SMALL_BUSINESS',
	'REVERSE_CHARGE',
	'NON_EU'
]);
export type TaxRegime = z.infer<typeof TaxRegimeSchema>;

/** Regime, bei denen keine Umsatzsteuer ausgewiesen wird. */
export const ZERO_RATE_REGIMES: ReadonlySet<TaxRegime> = new Set([
	'SMALL_BUSINESS',
	'REVERSE_CHARGE',
	'NON_EU'
]);

export const TaxInfoSchema = z.object({
	country: z.string().trim().length(2).toUpperCase().describe('Steuerland (ISO 3166-1 alpha-2)'),
	regime: TaxRegimeSchema
});
export type TaxInfo = z.infer<typeof TaxInfoSchema>;

export const AddressSchema = z.object({
	line1: z.string().trim().min(1),
	line2: z.string().trim().optional(),
	postalCode: z.string().trim().min(1),
	city: z.string().trim().min(1),
	country: z.string().trim().length(2).toUpperCase()
});

export const CustomerSchema = z.object({
	id: z.string().trim().min(1).max(100).describe('Kunden-ID im Shop'),
	email: z.email(),
	firstName: z.string().trim().optional(),
	lastName: z.string().trim().optional(),
	companyName: z.string().trim().optional(),
	address: AddressSchema.optional()
});
export type Customer = z.infer<typeof CustomerSchema>;

/** Position mit **festem Nettopreis** – die Umsatzsteuer wird je Steuersatz oben draufgerechnet. */
export const LineItemSchema = z.object({
	name: z.string().trim().min(1).max(127),
	description: z.string().trim().max(500).optional(),
	quantity: z.int().positive().max(10_000),
	unitNetAmount: z.int().nonnegative().describe('Nettopreis pro Stück in Cent'),
	taxRate: TaxRateSchema
});
export type LineItem = z.infer<typeof LineItemSchema>;

/** Umsatzsteuer je Steuersatz (auf die Nettosumme der Gruppe, wie in EÜRwerk). */
export interface TaxLine {
	taxRate: TaxRate;
	/** Nettosumme der Gruppe in Cent */
	netAmount: number;
	/** Steuer in Cent */
	taxAmount: number;
}

const hasConsistentTax = (input: { tax: TaxInfo; items: LineItem[] }): boolean =>
	!ZERO_RATE_REGIMES.has(input.tax.regime) || input.items.every((item) => item.taxRate === 0);

export const CreateCheckoutInputSchema = z
	.object({
		provider: ProviderNameSchema,
		reference: z.string().trim().min(1).max(127).describe('Bestell-/Transaktions-ID im Shop'),
		currency: z.string().length(3).toUpperCase().default('EUR'),
		customer: CustomerSchema,
		tax: TaxInfoSchema,
		// max. 90: Stripe erlaubt 100 Zeilen inkl. Steuerzeilen je Satz
		items: z.array(LineItemSchema).min(1).max(90),
		successUrl: z.url(),
		cancelUrl: z.url(),
		metadata: z
			.record(z.string().max(40), z.string().max(500))
			.refine((value) => Object.keys(value).length <= 20, 'Maximal 20 Metadaten-Einträge')
			.default({})
	})
	.refine(hasConsistentTax, {
		message: 'Bei Kleinunternehmer, Reverse Charge und Drittland muss der Steuersatz 0 sein',
		path: ['items']
	});
export type CreateCheckoutInput = z.infer<typeof CreateCheckoutInputSchema>;

export interface CheckoutAmounts {
	/** Netto + Steuer in Cent – wird eingezogen. */
	amountTotal: number;
	amountNet: number;
	amountTax: number;
}

/** Alles, was ein Provider zum Anlegen der Zahlung braucht (wird dort als Metadaten abgelegt). */
export type CheckoutRequest = CreateCheckoutInput &
	CheckoutAmounts & {
		taxLines: TaxLine[];
		/** EÜRwerk-Kontakt des Kunden – wird beim Provider gespeichert und später zum Buchen genutzt. */
		contactId: string;
	};

/**
 * Bezahlter Checkout, rekonstruiert aus den Provider-Daten – Grundlage für die Buchung.
 * Das Gateway speichert selbst nichts.
 */
export interface PaymentRecord extends CheckoutAmounts {
	checkoutId: string;
	provider: ProviderName;
	reference: string;
	contactId: string;
	currency: string;
	tax: TaxInfo;
	items: LineItem[];
	providerPaymentId: string | null;
}

/** Status-Sicht auf einen Checkout (live beim Provider abgefragt). */
export interface CheckoutView extends CheckoutAmounts {
	id: string;
	provider: ProviderName;
	status: CheckoutStatus;
	reference: string;
	currency: string;
	tax: TaxInfo;
	redirectUrl: string | null;
	providerPaymentId: string | null;
}
