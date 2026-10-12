import type { PaymentProvider } from '../../domain/payment/models/payment-provider.port.ts';
import { buildStripeSessionParams } from './build-stripe-session-params.helper.ts';
import { createStripeCheckoutSession, type StripeClientFactory } from './stripe-client.ts';

/** Stripe Checkout mit den im Stripe-Dashboard aktivierten Zahlungsarten (Karte, …). */
export const createStripeProvider = (createClient: StripeClientFactory): PaymentProvider => ({
	name: 'stripe',
	webhookSource: 'stripe',
	createCheckoutSession: (checkout, credentials) =>
		createStripeCheckoutSession(createClient, {
			credentials,
			params: buildStripeSessionParams(checkout),
			idempotencyKey: `checkout-${checkout.id}`
		})
});
