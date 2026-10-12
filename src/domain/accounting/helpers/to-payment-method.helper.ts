import type { ProviderName } from '../../checkout/models/checkout.schema.ts';
import type { AccountingPaymentMethod } from '../models/accounting.port.ts';

const PAYMENT_METHODS: Record<ProviderName, AccountingPaymentMethod> = {
	stripe: 'CREDIT_CARD',
	paypal: 'PAYPAL',
	// Wero = Echtzeit-Überweisung vom Bankkonto; EÜRwerk kennt (noch) keine eigene Zahlungsart
	wero: 'BANK_TRANSFER'
};

export const toPaymentMethod = (provider: ProviderName): AccountingPaymentMethod =>
	PAYMENT_METHODS[provider];
