import { DomainError } from '../../../shared/errors/domain-error.ts';
import type { WebhookSource } from '../../checkout/models/checkout.schema.ts';
import type { MerchantRepository } from '../../merchant/models/merchant.repository.ts';
import { providersForSource } from '../helpers/providers-for-source.helper.ts';
import type {
	PaymentProviderRegistry,
	WebhookProcessorRegistry,
	WebhookRequest
} from '../models/payment-provider.port.ts';
import type { ApplyPaymentOutcomeAction, ApplyResult } from './apply-payment-outcome.action.ts';

interface Dependencies {
	merchants: MerchantRepository;
	providers: PaymentProviderRegistry;
	webhookProcessors: WebhookProcessorRegistry;
	applyOutcome: Pick<ApplyPaymentOutcomeAction, 'execute'>;
}

export interface ProviderWebhookInput {
	source: WebhookSource;
	merchantId: string;
	request: WebhookRequest;
}

export class HandleProviderWebhookAction {
	readonly #deps: Dependencies;

	constructor(deps: Dependencies) {
		this.#deps = deps;
	}

	async execute(input: ProviderWebhookInput): Promise<ApplyResult | 'IGNORED_EVENT'> {
		const merchant = await this.#deps.merchants.findById(input.merchantId);
		if (!merchant?.credentials[input.source]) {
			throw new DomainError('NOT_FOUND', 'Merchant/Webhook-Kanal nicht gefunden');
		}
		const processor = this.#deps.webhookProcessors[input.source];
		const outcome = await processor.processWebhook(input.request, merchant.credentials);
		if (!outcome) {
			return 'IGNORED_EVENT';
		}
		const providers = providersForSource(this.#deps.providers, input.source);
		return this.#deps.applyOutcome.execute(merchant, providers, outcome);
	}
}
