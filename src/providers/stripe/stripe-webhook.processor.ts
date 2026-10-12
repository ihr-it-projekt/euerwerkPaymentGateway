import type { WebhookProcessor } from '../../domain/payment/models/payment-provider.port.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';
import { mapStripeEvent } from './map-stripe-event.helper.ts';
import { requireStripeCredentials, type StripeClientFactory } from './stripe-client.ts';

/** Webhook-Kanal des Stripe-Accounts – gilt für alle Stripe-basierten Zahlungsarten (inkl. Wero). */
export const createStripeWebhookProcessor = (
	createClient: StripeClientFactory
): WebhookProcessor => ({
	source: 'stripe',
	processWebhook: async (request, credentials) => {
		const { secretKey, webhookSecret } = requireStripeCredentials(credentials);
		const signature = request.headers['stripe-signature'] ?? '';
		const event = await createClient(secretKey)
			.webhooks.constructEventAsync(request.rawBody, signature, webhookSecret)
			.catch((error: unknown) => {
				throw new DomainError('INVALID_WEBHOOK_SIGNATURE', 'Ungültige Stripe-Signatur', {
					cause: error
				});
			});
		return mapStripeEvent(event);
	}
});
