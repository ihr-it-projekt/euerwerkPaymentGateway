import type { Logger } from '../../../shared/logger/logger.ts';
import type { BookPaymentAction } from '../../accounting/actions/book-payment.action.ts';
import type { WebhookSource } from '../../checkout/models/checkout.schema.ts';
import type { PaymentConfigSource } from '../../config/models/payment-config.port.ts';
import { assertProviderConfigured } from '../../checkout/helpers/assert-provider-configured.helper.ts';
import type { WebhookKeyCodec } from '../../webhook/models/webhook-key-codec.port.ts';
import type { WebhookProcessorRegistry, WebhookRequest } from '../models/payment-provider.port.ts';

interface Dependencies {
	keyCodec: WebhookKeyCodec;
	configSource: PaymentConfigSource;
	webhookProcessors: WebhookProcessorRegistry;
	bookPayment: Pick<BookPaymentAction, 'execute'>;
	logger: Logger;
}

export interface ProviderWebhookInput {
	source: WebhookSource;
	/** Verschlüsselter EÜRwerk-API-Key aus der Webhook-URL. */
	keyToken: string;
	request: WebhookRequest;
}

export type WebhookResult =
	| { result: 'IGNORED_EVENT' }
	| { result: 'NO_ACTION'; status: string }
	| { result: 'BOOKED'; invoiceId: string; alreadyBooked: boolean };

/**
 * Provider-Webhook → (bei Zahlungserfolg) Buchung in EÜRwerk.
 * Der Mandant ergibt sich allein aus dem verschlüsselten Key in der URL – keine Datenhaltung.
 */
export class HandleProviderWebhookAction {
	readonly #deps: Dependencies;

	constructor(deps: Dependencies) {
		this.#deps = deps;
	}

	async execute(input: ProviderWebhookInput): Promise<WebhookResult> {
		const apiKey = this.#deps.keyCodec.decode(input.keyToken);
		const config = await this.#deps.configSource.load(apiKey);
		assertProviderConfigured(config, input.source);
		const processor = this.#deps.webhookProcessors[input.source];
		const outcome = await processor.processWebhook(input.request, config);
		if (!outcome) {
			return { result: 'IGNORED_EVENT' };
		}
		if (!outcome.payment) {
			this.#deps.logger.info('Zahlungsstatus ohne Buchung', { ...outcome });
			return { result: 'NO_ACTION', status: outcome.status };
		}
		const booking = await this.#deps.bookPayment.execute(apiKey, outcome.payment);
		return { result: 'BOOKED', ...booking };
	}
}
