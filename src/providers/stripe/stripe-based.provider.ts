import type Stripe from 'stripe';
import type { ProviderName } from '../../domain/checkout/models/checkout.schema.ts';
import type { PaymentProvider } from '../../domain/payment/models/payment-provider.port.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';
import { buildStripeSessionParams } from './build-stripe-session-params.helper.ts';
import { readGatewaySession, toStripeCheckoutView } from './read-stripe-checkout.ts';
import {
	callStripe,
	createStripeCheckoutSession,
	requireStripeCredentials,
	type StripeClientFactory
} from './stripe-client.ts';

export interface StripeBasedProviderOptions {
	name: ProviderName;
	createClient: StripeClientFactory;
	/** Zusätzliche Session-Parameter, z.B. Einschränkung auf eine Zahlungsart. */
	extraParams?: Partial<Stripe.Checkout.SessionCreateParams>;
	assertEligible?: PaymentProvider['assertEligible'];
}

/** Gemeinsame Basis aller Zahlungsarten, die über Stripe Checkout laufen (Stripe, Wero). */
export const createStripeBasedProvider = (
	options: StripeBasedProviderOptions
): PaymentProvider => ({
	name: options.name,
	webhookSource: 'stripe',
	...(options.assertEligible ? { assertEligible: options.assertEligible } : {}),
	createCheckoutSession: async (checkout, config) => {
		const client = options.createClient(requireStripeCredentials(config).secretKey);
		return createStripeCheckoutSession(client, {
			...buildStripeSessionParams(checkout, options.name),
			...options.extraParams
		});
	},
	getCheckout: async (sessionId, config) => {
		const client = options.createClient(requireStripeCredentials(config).secretKey);
		const gateway = readGatewaySession(
			await callStripe(client.checkout.sessions.retrieve(sessionId))
		);
		if (gateway?.provider !== options.name) {
			throw new DomainError('NOT_FOUND', 'Checkout nicht gefunden');
		}
		return toStripeCheckoutView(gateway);
	}
});
