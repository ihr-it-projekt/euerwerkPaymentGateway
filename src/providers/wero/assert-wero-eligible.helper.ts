import type { CheckoutRequest } from '../../domain/checkout/models/checkout.schema.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';

/** Wero-Vorgaben (Stripe): nur EUR, Mindestbetrag 0,50 €. */
export const WERO_MIN_AMOUNT = 50;

export const assertWeroEligible = (
	checkout: Pick<CheckoutRequest, 'currency' | 'amountTotal'>
): void => {
	if (checkout.currency !== 'EUR') {
		throw new DomainError('VALIDATION_FAILED', 'Wero unterstützt nur Zahlungen in EUR');
	}
	if (checkout.amountTotal < WERO_MIN_AMOUNT) {
		throw new DomainError('VALIDATION_FAILED', 'Wero erfordert einen Mindestbetrag von 0,50 €');
	}
};
