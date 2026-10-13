import type { WebhookSource } from '../../checkout/models/checkout.schema.ts';
import type { PaymentConfigSource } from '../../config/models/payment-config.port.ts';
import type { WebhookKeyCodec } from '../models/webhook-key-codec.port.ts';

interface Dependencies {
	configSource: PaymentConfigSource;
	keyCodec: WebhookKeyCodec;
	publicBaseUrl: string;
}

export type WebhookEndpoints = Partial<Record<WebhookSource, string>>;

/**
 * Liefert die im Stripe-/PayPal-Dashboard einzutragenden Webhook-URLs (nur für konfigurierte
 * Kanäle). Die URL enthält den API-Key verschlüsselt → nach Key-Rotation neu eintragen.
 */
export class GetWebhookEndpointsAction {
	readonly #deps: Dependencies;

	constructor(deps: Dependencies) {
		this.#deps = deps;
	}

	async execute(apiKey: string): Promise<WebhookEndpoints> {
		const config = await this.#deps.configSource.load(apiKey);
		const sources: WebhookSource[] = ['stripe', 'paypal'];
		const token = this.#deps.keyCodec.encode(apiKey);
		return Object.fromEntries(
			sources
				.filter((source) => Boolean(config[source]))
				.map((source) => [source, `${this.#deps.publicBaseUrl}/v1/webhooks/${source}/${token}`])
		);
	}
}
