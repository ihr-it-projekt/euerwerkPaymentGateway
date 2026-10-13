import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import type {
	PaymentConfig,
	StripeCredentials
} from '../../domain/config/models/payment-config.schema.ts';
import type { ProviderCheckoutSession } from '../../domain/payment/models/payment-provider.port.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';

export type StripeClientFactory = (secretKey: string) => Stripe;

/** fetch-basierter HTTP-Client, damit der MSW-Mockserver alle Calls abfängt. */
export const createStripeClient: StripeClientFactory = (secretKey) =>
	new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 });

export const requireStripeCredentials = (config: PaymentConfig): StripeCredentials => {
	if (!config.stripe) {
		throw new DomainError('PROVIDER_NOT_CONFIGURED', 'Stripe ist nicht konfiguriert');
	}
	return config.stripe;
};

const toDomainError = (error: unknown): never => {
	const notFound = error instanceof Stripe.errors.StripeError && error.statusCode === 404;
	throw new DomainError(notFound ? 'NOT_FOUND' : 'UPSTREAM_ERROR', `Stripe: ${String(error)}`, {
		cause: error
	});
};

/** Stripe-Aufruf mit einheitlichem Fehler-Mapping (404 → NOT_FOUND, sonst UPSTREAM_ERROR). */
export const callStripe = <T>(request: Promise<T>): Promise<T> => request.catch(toDomainError);

/** Gleicher Request → gleicher Key → Stripe liefert bei Retries dieselbe Session. */
const idempotencyKeyFor = (params: Stripe.Checkout.SessionCreateParams): string =>
	`pgw-${createHash('sha256').update(JSON.stringify(params)).digest('hex')}`;

const toSession = (session: Stripe.Checkout.Session): ProviderCheckoutSession => {
	if (!session.url) {
		throw new DomainError('UPSTREAM_ERROR', 'Stripe hat keine Checkout-URL geliefert');
	}
	return { providerReference: session.id, redirectUrl: session.url };
};

export const createStripeCheckoutSession = async (
	client: Stripe,
	params: Stripe.Checkout.SessionCreateParams
): Promise<ProviderCheckoutSession> => {
	const session = await callStripe(
		client.checkout.sessions.create(params, { idempotencyKey: idempotencyKeyFor(params) })
	);
	return toSession(session);
};
