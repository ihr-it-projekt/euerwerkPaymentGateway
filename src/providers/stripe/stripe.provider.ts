import type { PaymentProvider } from '../../domain/payment/models/payment-provider.port.ts';
import { createStripeBasedProvider } from './stripe-based.provider.ts';
import type { StripeClientFactory } from './stripe-client.ts';

/** Stripe Checkout mit den im Stripe-Dashboard aktivierten Zahlungsarten (Karte, …). */
export const createStripeProvider = (createClient: StripeClientFactory): PaymentProvider =>
	createStripeBasedProvider({ name: 'stripe', createClient });
