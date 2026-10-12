import { z } from '@hono/zod-openapi';
import {
	AccountingStatusSchema,
	CheckoutStatusSchema,
	CustomerSchema,
	LineItemSchema,
	ProviderNameSchema
} from '../../domain/checkout/models/checkout.schema.ts';

export const ErrorResponseSchema = z
	.object({
		error: z.object({
			code: z.string(),
			message: z.string(),
			details: z.unknown().optional()
		})
	})
	.openapi('Error');

export const CheckoutViewSchema = z
	.object({
		id: z.uuid(),
		reference: z.string(),
		provider: ProviderNameSchema,
		status: CheckoutStatusSchema,
		currency: z.string(),
		amountTotal: z.int().describe('Bruttosumme in Cent'),
		customer: CustomerSchema,
		items: z.array(LineItemSchema),
		successUrl: z.string(),
		cancelUrl: z.string(),
		metadata: z.record(z.string(), z.string()),
		providerReference: z.string().nullable(),
		providerPaymentId: z.string().nullable(),
		redirectUrl: z.string().nullable().describe('URL, auf die der Shop den Kunden weiterleitet'),
		accountingStatus: AccountingStatusSchema,
		accountingInvoiceId: z.string().nullable(),
		createdAt: z.string(),
		updatedAt: z.string()
	})
	.openapi('Checkout');

export const CheckoutIdParamSchema = z.object({
	id: z.uuid().openapi({ param: { name: 'id', in: 'path' } })
});

export const CreatedMerchantSchema = z
	.object({
		id: z.uuid(),
		name: z.string(),
		apiKey: z.string().describe('Nur einmalig sichtbar'),
		webhookSigningSecret: z.string().describe('Zur Prüfung von X-Gateway-Signature im Shop'),
		providerWebhookUrls: z.object({ stripe: z.string(), paypal: z.string() })
	})
	.openapi('CreatedMerchant');

export const errorResponses = {
	400: {
		description: 'Ungültige Anfrage',
		content: { 'application/json': { schema: ErrorResponseSchema } }
	},
	401: {
		description: 'Nicht authentifiziert',
		content: { 'application/json': { schema: ErrorResponseSchema } }
	}
} as const;
