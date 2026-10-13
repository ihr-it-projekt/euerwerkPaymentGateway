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
 * Eingehende Provider-Webhooks: `/v1/webhooks/<kanal>/<verschlüsselter EÜRwerk-Key>`.
 * Wero-Zahlungen laufen über Stripe und kommen am Stripe-Endpunkt an. Bewusst ohne zod-openapi:
 * die Signaturprüfung braucht den unveränderten Raw-Body.
 * Fehler bei der Buchung → 5xx → der Provider wiederholt den Webhook (Retry ohne eigene Queue).
 */
export const createWebhookRoutes = (
	handleWebhook: Pick<HandleProviderWebhookAction, 'execute'>
): Hono =>
	new Hono().post('/:source/:keyToken', async (c) => {
		const result = await handleWebhook.execute({
			source: parseSource(c.req.param('source')),
			keyToken: c.req.param('keyToken'),
			request: { rawBody: await c.req.text(), headers: c.req.header() }
		});
		return c.json({ received: true, ...result }, 200);
	});
