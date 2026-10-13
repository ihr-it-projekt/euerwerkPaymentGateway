import { DomainError } from '../../../shared/errors/domain-error.ts';
import { type ProviderName, ProviderNameSchema } from '../models/checkout.schema.ts';

/** Provider-Referenzen werden in Provider-URLs eingesetzt → nur sichere Zeichen zulassen. */
const PROVIDER_REFERENCE = /^[A-Za-z0-9_-]{1,255}$/;

export interface ParsedCheckoutId {
	provider: ProviderName;
	providerReference: string;
}

/** Checkout-ID = `<provider>.<providerReference>`, z.B. `wero.cs_test_a1b2` – zustandslos auflösbar. */
export const formatCheckoutId = (provider: ProviderName, providerReference: string): string =>
	`${provider}.${providerReference}`;

export const parseCheckoutId = (checkoutId: string): ParsedCheckoutId => {
	const [prefix = '', providerReference = ''] = checkoutId.split(/\.(.*)/s);
	const provider = ProviderNameSchema.safeParse(prefix);
	if (!provider.success || !PROVIDER_REFERENCE.test(providerReference)) {
		throw new DomainError('NOT_FOUND', 'Checkout nicht gefunden');
	}
	return { provider: provider.data, providerReference };
};
