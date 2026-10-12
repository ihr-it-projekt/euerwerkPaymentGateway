import { z } from 'zod';

export const PayPalTokenResponseSchema = z.object({
	access_token: z.string(),
	expires_in: z.number()
});

export const PayPalLinkSchema = z.object({ href: z.string(), rel: z.string() });

export const PayPalOrderResponseSchema = z.object({
	id: z.string(),
	status: z.string(),
	links: z.array(PayPalLinkSchema).default([])
});
export type PayPalOrderResponse = z.infer<typeof PayPalOrderResponseSchema>;

export const PayPalCaptureSchema = z.object({ id: z.string(), status: z.string() });

export const PayPalCaptureResponseSchema = z.object({
	id: z.string(),
	status: z.string(),
	purchase_units: z
		.array(
			z.object({
				payments: z.object({ captures: z.array(PayPalCaptureSchema).default([]) }).optional()
			})
		)
		.default([])
});
export type PayPalCaptureResponse = z.infer<typeof PayPalCaptureResponseSchema>;

export const PayPalVerifyResponseSchema = z.object({
	verification_status: z.enum(['SUCCESS', 'FAILURE'])
});

export const PayPalWebhookEventSchema = z.object({
	id: z.string(),
	event_type: z.string(),
	resource: z.record(z.string(), z.unknown())
});
export type PayPalWebhookEvent = z.infer<typeof PayPalWebhookEventSchema>;

export const PayPalCaptureResourceSchema = z.object({
	id: z.string(),
	supplementary_data: z.object({
		related_ids: z.object({ order_id: z.string() })
	})
});
