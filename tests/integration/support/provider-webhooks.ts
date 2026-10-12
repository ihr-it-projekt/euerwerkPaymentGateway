import { faker } from '@faker-js/faker';
import Stripe from 'stripe';
import { PAYPAL_INVALID_SIGNATURE } from '../../mock-server/constants.ts';
import type { CreatedTestMerchant, TestContext } from './test-app.ts';

interface StripeEventInput {
	type: string;
	session: Record<string, unknown>;
	signatureSecret?: string;
}

/** Sendet ein korrekt (oder bewusst falsch) signiertes Stripe-Event an das Gateway. */
export const sendStripeEvent = async (
	app: TestContext['app'],
	merchant: CreatedTestMerchant,
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
		secret: input.signatureSecret ?? merchant.input.stripe!.webhookSecret
	});
	return app.request(`/v1/webhooks/stripe/${merchant.id}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
		body: payload
	});
};

interface PayPalEventInput {
	eventType: string;
	resource: Record<string, unknown>;
	invalidSignature?: boolean;
}

export const sendPayPalEvent = async (
	app: TestContext['app'],
	merchantId: string,
	input: PayPalEventInput
): Promise<Response> =>
	await app.request(`/v1/webhooks/paypal/${merchantId}`, {
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
