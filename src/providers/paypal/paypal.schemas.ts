import { z } from 'zod';

export const PayPalTokenResponseSchema = z.object({
	access_token: z.string(),
	expires_in: z.number()
});

const MoneySchema = z.object({ currency_code: z.string(), value: z.string() });

const PayPalItemSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	quantity: z.string(),
	unit_amount: MoneySchema,
	sku: z.string().optional()
});
export type PayPalItem = z.infer<typeof PayPalItemSchema>;

const PayPalCaptureSchema = z.object({ id: z.string(), status: z.string() });

const PayPalPurchaseUnitSchema = z.object({
	reference_id: z.string().optional(),
	custom_id: z.string().optional(),
	amount: MoneySchema,
	items: z.array(PayPalItemSchema).default([]),
	payments: z.object({ captures: z.array(PayPalCaptureSchema).default([]) }).optional()
});

export const PayPalOrderSchema = z.object({
	id: z.string(),
	status: z.string(),
	links: z.array(z.object({ href: z.string(), rel: z.string() })).default([]),
	purchase_units: z.array(PayPalPurchaseUnitSchema).default([])
});
export type PayPalOrder = z.infer<typeof PayPalOrderSchema>;

export const PayPalVerifyResponseSchema = z.object({
	verification_status: z.enum(['SUCCESS', 'FAILURE'])
});

export const PayPalWebhookEventSchema = z.object({
	id: z.string(),
	event_type: z.string(),
	resource: z.record(z.string(), z.unknown())
});
export type PayPalWebhookEvent = z.infer<typeof PayPalWebhookEventSchema>;

export const PayPalOrderResourceSchema = z.object({ id: z.string() });

export const PayPalCaptureResourceSchema = z.object({
	supplementary_data: z.object({
		related_ids: z.object({ order_id: z.string() })
	})
});
