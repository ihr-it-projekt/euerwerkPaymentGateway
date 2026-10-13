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

export const TaxRateSchema = z.union([z.literal(0), z.literal(7), z.literal(19)]);
export type TaxRate = z.infer<typeof TaxRateSchema>;

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

export const LineItemSchema = z.object({
	name: z.string().trim().min(1).max(127),
	description: z.string().trim().max(500).optional(),
	quantity: z.int().positive(),
	unitAmount: z.int().nonnegative().describe('Bruttopreis pro Stück in Cent'),
	taxRate: TaxRateSchema
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const CreateCheckoutInputSchema = z.object({
	provider: ProviderNameSchema,
	reference: z.string().trim().min(1).max(127).describe('Bestell-/Transaktions-ID im Shop'),
	currency: z.string().length(3).toUpperCase().default('EUR'),
	customer: CustomerSchema,
	items: z.array(LineItemSchema).min(1).max(100),
	successUrl: z.url(),
	cancelUrl: z.url(),
	metadata: z
		.record(z.string().max(40), z.string().max(500))
		.refine((value) => Object.keys(value).length <= 20, 'Maximal 20 Metadaten-Einträge')
		.default({})
});
export type CreateCheckoutInput = z.infer<typeof CreateCheckoutInputSchema>;

/** Alles, was ein Provider zum Anlegen der Zahlung braucht (wird dort als Metadaten abgelegt). */
export type CheckoutRequest = CreateCheckoutInput & {
	amountTotal: number;
	/** EÜRwerk-Kontakt des Kunden – wird beim Provider gespeichert und später zum Buchen genutzt. */
	contactId: string;
};

/**
 * Bezahlter Checkout, rekonstruiert aus den Provider-Daten – Grundlage für die Buchung.
 * Das Gateway speichert selbst nichts.
 */
export interface PaymentRecord {
	checkoutId: string;
	provider: ProviderName;
	reference: string;
	contactId: string;
	currency: string;
	amountTotal: number;
	items: LineItem[];
	providerPaymentId: string | null;
}

/** Status-Sicht auf einen Checkout (live beim Provider abgefragt). */
export interface CheckoutView {
	id: string;
	provider: ProviderName;
	status: CheckoutStatus;
	reference: string;
	currency: string;
	amountTotal: number;
	redirectUrl: string | null;
	providerPaymentId: string | null;
}
