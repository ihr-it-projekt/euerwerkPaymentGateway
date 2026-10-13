import type { PaymentProvider } from '../../domain/payment/models/payment-provider.port.ts';
import { createStripeBasedProvider } from '../stripe/stripe-based.provider.ts';
import type { StripeClientFactory } from '../stripe/stripe-client.ts';
import { assertWeroEligible } from './assert-wero-eligible.helper.ts';

/**
 * Wero über Stripe als Acquirer: Stripe Checkout, eingeschränkt auf die Zahlungsart `wero`.
 * Voraussetzung: Wero ist im Stripe-Dashboard des Mandanten aktiviert.
 * Statusmeldungen kommen über den Stripe-Webhook (`webhookSource: 'stripe'`).
 */
export const createWeroViaStripeProvider = (createClient: StripeClientFactory): PaymentProvider =>
	createStripeBasedProvider({
		name: 'wero',
		createClient,
		extraParams: { allowed_payment_method_types: ['wero'] },
		assertEligible: assertWeroEligible
	});
