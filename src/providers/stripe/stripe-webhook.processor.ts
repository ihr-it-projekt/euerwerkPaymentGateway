import type Stripe from 'stripe';
import type {
	PaymentOutcome,
	WebhookProcessor,
	WebhookRequest
} from '../../domain/payment/models/payment-provider.port.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';
import { mapStripeEvent } from './map-stripe-event.helper.ts';
import { loadStripePaymentRecord, readGatewaySession } from './read-stripe-checkout.ts';
import { requireStripeCredentials, type StripeClientFactory } from './stripe-client.ts';

const verifyEvent = async (
	client: Stripe,
	request: WebhookRequest,
	webhookSecret: string
): Promise<Stripe.Event> => {
	const signature = request.headers['stripe-signature'] ?? '';
	return client.webhooks
		.constructEventAsync(request.rawBody, signature, webhookSecret)
		.catch((error: unknown) => {
			throw new DomainError('INVALID_WEBHOOK_SIGNATURE', 'Ungültige Stripe-Signatur', {
				cause: error
			});
		});
};

/** Nur Gateway-Sessions; bei Zahlungserfolg werden die Buchungsdaten nachgeladen. */
const toOutcome = async (client: Stripe, event: Stripe.Event): Promise<PaymentOutcome | null> => {
	const mapped = mapStripeEvent(event);
	const gateway = mapped ? readGatewaySession(mapped.session) : null;
	if (!mapped || !gateway) {
		return null;
	}
	const payment =
		mapped.status === 'SUCCEEDED' ? await loadStripePaymentRecord(client, gateway) : null;
	return { providerReference: gateway.session.id, status: mapped.status, payment };
};

/** Webhook-Kanal des Stripe-Accounts – gilt für alle Stripe-basierten Zahlungsarten (inkl. Wero). */
export const createStripeWebhookProcessor = (
	createClient: StripeClientFactory
): WebhookProcessor => ({
	source: 'stripe',
	processWebhook: async (request, config) => {
		const { secretKey, webhookSecret } = requireStripeCredentials(config);
		const client = createClient(secretKey);
		return toOutcome(client, await verifyEvent(client, request, webhookSecret));
	}
});
