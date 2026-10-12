import type { Merchant } from '../../merchant/models/merchant.schema.ts';
import type { PaymentProviderRegistry } from '../../payment/models/payment-provider.port.ts';
import { assertProviderConfigured } from '../helpers/assert-provider-configured.helper.ts';
import { buildCheckout } from '../helpers/build-checkout.helper.ts';
import type { CheckoutRepository } from '../models/checkout.repository.ts';
import type { Checkout, CreateCheckoutInput } from '../models/checkout.schema.ts';

interface Dependencies {
	checkouts: CheckoutRepository;
	providers: PaymentProviderRegistry;
}

export class CreateCheckoutAction {
	readonly #deps: Dependencies;

	constructor(deps: Dependencies) {
		this.#deps = deps;
	}

	async execute(merchant: Merchant, input: CreateCheckoutInput): Promise<Checkout> {
		assertProviderConfigured(merchant.credentials, input.provider);
		const provider = this.#deps.providers[input.provider];
		const draft = buildCheckout(merchant, input, new Date());
		provider.assertEligible?.(draft);
		const checkout = await this.#deps.checkouts.insert(draft);
		try {
			const session = await provider.createCheckoutSession(checkout, merchant.credentials);
			return await this.#deps.checkouts.linkProvider(checkout.id, session);
		} catch (error) {
			await this.#deps.checkouts.updateStatus(checkout.id, { status: 'FAILED' });
			throw error;
		}
	}
}
