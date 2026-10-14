import type { AccountingGateway } from '../../accounting/models/accounting.port.ts';
import type { PaymentConfigSource } from '../../config/models/payment-config.port.ts';
import type { PaymentProviderRegistry } from '../../payment/models/payment-provider.port.ts';
import { assertProviderConfigured } from '../helpers/assert-provider-configured.helper.ts';
import { formatCheckoutId } from '../helpers/checkout-id.helper.ts';
import { priceCheckout } from '../helpers/price-checkout.helper.ts';
import type {
	CheckoutRequest,
	CheckoutView,
	CreateCheckoutInput
} from '../models/checkout.schema.ts';

interface Dependencies {
	configSource: PaymentConfigSource;
	accounting: Pick<AccountingGateway, 'upsertContact'>;
	providers: PaymentProviderRegistry;
}

/**
 * Legt die Zahlung beim Provider an. Zustandslos: Konfiguration kommt aus EÜRwerk, alle
 * Checkout-Daten werden beim Provider abgelegt, der Kunde wird idempotent als Kontakt angelegt.
 */
export class CreateCheckoutAction {
	readonly #deps: Dependencies;

	constructor(deps: Dependencies) {
		this.#deps = deps;
	}

	async execute(apiKey: string, input: CreateCheckoutInput): Promise<CheckoutView> {
		const config = await this.#deps.configSource.load(apiKey);
		assertProviderConfigured(config, input.provider);
		const provider = this.#deps.providers[input.provider];
		const priced = priceCheckout(input.items);
		provider.assertEligible?.({ currency: input.currency, amountTotal: priced.amountTotal });
		const contactId = await this.#deps.accounting.upsertContact(apiKey, input.customer);
		const request: CheckoutRequest = { ...input, ...priced, contactId };
		const session = await provider.createCheckoutSession(request, config);
		return {
			id: formatCheckoutId(input.provider, session.providerReference),
			provider: input.provider,
			status: 'PENDING',
			reference: input.reference,
			currency: input.currency,
			tax: input.tax,
			amountNet: priced.amountNet,
			amountTax: priced.amountTax,
			amountTotal: priced.amountTotal,
			redirectUrl: session.redirectUrl,
			providerPaymentId: null
		};
	}
}
