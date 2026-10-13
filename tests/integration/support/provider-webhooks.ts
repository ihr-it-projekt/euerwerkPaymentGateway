import { faker } from '@faker-js/faker';
import Stripe from 'stripe';
import { PAYPAL_INVALID_SIGNATURE } from '../../mock-server/constants.ts';
import type { MockSession } from '../../mock-server/handlers/stripe.handlers.ts';
import { type TestApp, type TestTenant, toPath } from './test-app.ts';

interface StripeEventInput {
	webhookUrl: string;
	type: string;
	session: MockSession | Record<string, unknown>;
	signatureSecret?: string;
}

/** Sendet ein korrekt (oder bewusst falsch) signiertes Stripe-Event an die Webhook-URL. */
export const sendStripeEvent = async (
	app: TestApp,
	tenant: TestTenant,
	input: StripeEventInput
): Promise<Response> => {
	const payload = JSON.stringify({
		id: `evt_${faker.string.alphanumeric(24)}`,
		object: 'event',
		type: input.type,
		data: { object: { object: 'checkout.session', ...input.session } }
	});
	const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
		payload,
		secret: input.signatureSecret ?? tenant.config.stripe!.webhookSecret
	});
	return app.request(toPath(input.webhookUrl), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
		body: payload
	});
};

interface PayPalEventInput {
	webhookUrl: string;
	eventType: string;
	resource: Record<string, unknown>;
	invalidSignature?: boolean;
}

export const sendPayPalEvent = async (app: TestApp, input: PayPalEventInput): Promise<Response> =>
	await app.request(toPath(input.webhookUrl), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'PayPal-Auth-Algo': 'SHA256withRSA',
			'PayPal-Cert-Url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT',
			'PayPal-Transmission-Id': faker.string.uuid(),
			'PayPal-Transmission-Sig': input.invalidSignature
				? PAYPAL_INVALID_SIGNATURE
				: faker.string.alphanumeric(64),
			'PayPal-Transmission-Time': new Date().toISOString()
		},
		body: JSON.stringify({
			id: `WH-${faker.string.alphanumeric(17)}`,
			event_type: input.eventType,
			resource: input.resource
		})
	});

export const paypalCaptureResource = (orderId: string): Record<string, unknown> => ({
	id: faker.string.alphanumeric(17).toUpperCase(),
	status: 'COMPLETED',
	supplementary_data: { related_ids: { order_id: orderId } }
});
