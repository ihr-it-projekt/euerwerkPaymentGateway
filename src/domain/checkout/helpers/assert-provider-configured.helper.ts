import { DomainError } from '../../../shared/errors/domain-error.ts';
import type { MerchantCredentials } from '../../merchant/models/merchant.schema.ts';
import type { ProviderName } from '../models/checkout.schema.ts';

export const assertProviderConfigured = (
	credentials: MerchantCredentials,
	provider: ProviderName
): void => {
	if (!credentials[provider]) {
		throw new DomainError(
			'PROVIDER_NOT_CONFIGURED',
			`Zahlungsanbieter "${provider}" ist für diesen Merchant nicht konfiguriert`
		);
	}
};
