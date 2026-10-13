import { z } from '@hono/zod-openapi';
import {
	CheckoutStatusSchema,
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
		id: z.string().describe('`<provider>.<providerReference>`, z.B. `wero.cs_test_a1b2`'),
		provider: ProviderNameSchema,
		status: CheckoutStatusSchema,
		reference: z.string().describe('Bestell-/Transaktions-ID im Shop'),
		currency: z.string(),
		amountTotal: z.int().describe('Bruttosumme in Cent'),
		redirectUrl: z.string().nullable().describe('URL, auf die der Shop den Kunden weiterleitet'),
		providerPaymentId: z.string().nullable()
	})
	.openapi('Checkout');

export const CheckoutIdParamSchema = z.object({
	id: z
		.string()
		.min(3)
		.max(300)
		.openapi({ param: { name: 'id', in: 'path' }, example: 'stripe.cs_test_a1b2' })
});

export const WebhookEndpointsSchema = z
	.object({
		stripe: z.string().optional().describe('Im Stripe-Dashboard als Webhook-URL eintragen'),
		paypal: z.string().optional().describe('Im PayPal-Developer-Dashboard eintragen')
	})
	.openapi('WebhookEndpoints');

const errorContent = { 'application/json': { schema: ErrorResponseSchema } };

export const errorResponses = {
	400: { description: 'Ungültige Anfrage', content: errorContent },
	401: { description: 'EÜRwerk-API-Key fehlt oder ungültig', content: errorContent },
	502: { description: 'Fehler bei EÜRwerk oder dem Zahlungsanbieter', content: errorContent }
} as const;
