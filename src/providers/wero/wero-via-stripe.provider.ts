import type { PaymentProvider } from '../../domain/payment/models/payment-provider.port.ts';
import { buildStripeSessionParams } from '../stripe/build-stripe-session-params.helper.ts';
import { createStripeCheckoutSession, type StripeClientFactory } from '../stripe/stripe-client.ts';
import { assertWeroEligible } from './assert-wero-eligible.helper.ts';

/**
 * Wero über Stripe als Acquirer: Stripe Checkout, eingeschränkt auf die Zahlungsart `wero`.
 * Voraussetzung: Wero ist im Stripe-Dashboard des Merchants aktiviert.
 * Statusmeldungen kommen über den Stripe-Webhook (`webhookSource: 'stripe'`).
 */
export const createWeroViaStripeProvider = (
	createClient: StripeClientFactory
): PaymentProvider => ({
	name: 'wero',
	webhookSource: 'stripe',
	assertEligible: assertWeroEligible,
	createCheckoutSession: (checkout, credentials) =>
		createStripeCheckoutSession(createClient, {
			credentials,
			params: { ...buildStripeSessionParams(checkout), allowed_payment_method_types: ['wero'] },
			idempotencyKey: `checkout-${checkout.id}`
		})
});
