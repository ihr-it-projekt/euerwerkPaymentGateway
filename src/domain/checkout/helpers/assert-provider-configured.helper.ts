import { DomainError } from '../../../shared/errors/domain-error.ts';
import type { PaymentConfig } from '../../config/models/payment-config.schema.ts';
import type { ProviderName } from '../models/checkout.schema.ts';

export const assertProviderConfigured = (config: PaymentConfig, provider: ProviderName): void => {
	if (!config[provider]) {
		throw new DomainError(
			'PROVIDER_NOT_CONFIGURED',
			`Zahlungsanbieter "${provider}" ist in EÜRwerk nicht konfiguriert`
		);
	}
};
