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

export const AccountingStatusSchema = z.enum(['NOT_REQUIRED', 'PENDING', 'BOOKED', 'FAILED']);
export type AccountingStatus = z.infer<typeof AccountingStatusSchema>;

export const TaxRateSchema = z.union([z.literal(0), z.literal(7), z.literal(19)]);

export const AddressSchema = z.object({
	line1: z.string().trim().min(1),
	line2: z.string().trim().optional(),
	postalCode: z.string().trim().min(1),
	city: z.string().trim().min(1),
	country: z.string().trim().length(2).toUpperCase()
});

export const CustomerSchema = z.object({
	id: z.string().trim().min(1).describe('Kunden-ID im Shop'),
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
	items: z.array(LineItemSchema).min(1),
	successUrl: z.url(),
	cancelUrl: z.url(),
	metadata: z.record(z.string(), z.string()).default({})
});
export type CreateCheckoutInput = z.infer<typeof CreateCheckoutInputSchema>;

export interface Checkout {
	id: string;
	merchantId: string;
	reference: string;
	provider: ProviderName;
	status: CheckoutStatus;
	currency: string;
	amountTotal: number;
	customer: Customer;
	items: LineItem[];
	successUrl: string;
	cancelUrl: string;
	metadata: Record<string, string>;
	providerReference: string | null;
	providerPaymentId: string | null;
	redirectUrl: string | null;
	accountingStatus: AccountingStatus;
	accountingInvoiceId: string | null;
	createdAt: Date;
	updatedAt: Date;
}
