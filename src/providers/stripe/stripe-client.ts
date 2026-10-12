import Stripe from 'stripe';
import type {
	MerchantCredentials,
	StripeCredentials
} from '../../domain/merchant/models/merchant.schema.ts';
import type { ProviderCheckoutSession } from '../../domain/payment/models/payment-provider.port.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';

export type StripeClientFactory = (secretKey: string) => Stripe;

/** fetch-basierter HTTP-Client, damit der MSW-Mockserver alle Calls abfängt. */
export const createStripeClient: StripeClientFactory = (secretKey) =>
	new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 });

export const requireStripeCredentials = (credentials: MerchantCredentials): StripeCredentials => {
	if (!credentials.stripe) {
		throw new DomainError('PROVIDER_NOT_CONFIGURED', 'Stripe ist nicht konfiguriert');
	}
	return credentials.stripe;
};

const toUpstreamError = (error: unknown): never => {
	throw new DomainError('UPSTREAM_ERROR', `Stripe-Fehler: ${String(error)}`, { cause: error });
};

const toSession = (session: Stripe.Checkout.Session): ProviderCheckoutSession => {
	if (!session.url) {
		throw new DomainError('UPSTREAM_ERROR', 'Stripe hat keine Checkout-URL geliefert');
	}
	return { providerReference: session.id, redirectUrl: session.url };
};

export interface StripeSessionRequest {
	credentials: MerchantCredentials;
	params: Stripe.Checkout.SessionCreateParams;
	idempotencyKey: string;
}

/** Gemeinsamer Aufruf für alle Zahlungsarten, die über Stripe Checkout laufen. */
export const createStripeCheckoutSession = async (
	createClient: StripeClientFactory,
	request: StripeSessionRequest
): Promise<ProviderCheckoutSession> => {
	const client = createClient(requireStripeCredentials(request.credentials).secretKey);
	const session = await client.checkout.sessions
		.create(request.params, { idempotencyKey: request.idempotencyKey })
		.catch(toUpstreamError);
	return toSession(session);
};
