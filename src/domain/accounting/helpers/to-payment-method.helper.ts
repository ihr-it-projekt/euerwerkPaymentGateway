import type { ProviderName } from '../../checkout/models/checkout.schema.ts';
import type { AccountingPaymentMethod } from '../models/accounting.port.ts';

const PAYMENT_METHODS: Record<ProviderName, AccountingPaymentMethod> = {
	stripe: 'STRIPE',
	paypal: 'PAYPAL',
	wero: 'WERO'
};

export const toPaymentMethod = (provider: ProviderName): AccountingPaymentMethod =>
	PAYMENT_METHODS[provider];
