import type { ProviderName, WebhookSource } from '../../checkout/models/checkout.schema.ts';
import type { PaymentProviderRegistry } from '../models/payment-provider.port.ts';

/** Alle Provider, deren Statusmeldungen über den Webhook-Kanal `source` eintreffen. */
export const providersForSource = (
	registry: PaymentProviderRegistry,
	source: WebhookSource
): ProviderName[] =>
	Object.values(registry)
		.filter((provider) => provider.webhookSource === source)
		.map((provider) => provider.name);
