import type { PaymentConfigSource } from '../../config/models/payment-config.port.ts';
import type { PaymentProviderRegistry } from '../../payment/models/payment-provider.port.ts';
import { assertProviderConfigured } from '../helpers/assert-provider-configured.helper.ts';
import { parseCheckoutId } from '../helpers/checkout-id.helper.ts';
import type { CheckoutView } from '../models/checkout.schema.ts';

interface Dependencies {
	configSource: PaymentConfigSource;
	providers: PaymentProviderRegistry;
}

/**
 * Status live beim Provider abfragen – mit den Credentials des anfragenden Mandanten.
 * Fremde Checkouts sind dadurch automatisch nicht auffindbar (Provider liefert 404).
 */
export class GetCheckoutAction {
	readonly #deps: Dependencies;

	constructor(deps: Dependencies) {
		this.#deps = deps;
	}

	async execute(apiKey: string, checkoutId: string): Promise<CheckoutView> {
		const { provider, providerReference } = parseCheckoutId(checkoutId);
		const config = await this.#deps.configSource.load(apiKey);
		assertProviderConfigured(config, provider);
		return this.#deps.providers[provider].getCheckout(providerReference, config);
	}
}
