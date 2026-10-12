import { Hono } from 'hono';
import {
	type WebhookSource,
	WebhookSourceSchema
} from '../../domain/checkout/models/checkout.schema.ts';
import type { HandleProviderWebhookAction } from '../../domain/payment/actions/handle-provider-webhook.action.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';

const parseSource = (value: string): WebhookSource => {
	const result = WebhookSourceSchema.safeParse(value);
	if (!result.success) {
		throw new DomainError('NOT_FOUND', 'Unbekannter Webhook-Kanal');
	}
	return result.data;
};

/**
 * Eingehende Provider-Webhooks, ein Endpunkt pro Kanal (stripe, paypal). Wero-Zahlungen laufen
 * über Stripe und kommen daher am Stripe-Endpunkt an. Bewusst ohne zod-openapi: die
 * Signaturprüfung braucht den unveränderten Raw-Body.
 */
export const createWebhookRoutes = (
	handleWebhook: Pick<HandleProviderWebhookAction, 'execute'>
): Hono =>
	new Hono().post('/:source/:merchantId', async (c) => {
		const result = await handleWebhook.execute({
			source: parseSource(c.req.param('source')),
			merchantId: c.req.param('merchantId'),
			request: { rawBody: await c.req.text(), headers: c.req.header() }
		});
		return c.json({ received: true, result }, 200);
	});
