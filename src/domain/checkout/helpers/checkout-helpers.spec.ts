import { describe, expect, it } from 'vitest';
import { buildCheckout, buildLineItem } from '#tests/factories/checkout.factory.ts';
import { buildCredentials } from '#tests/factories/merchant.factory.ts';
import type { DomainError } from '../../../shared/errors/domain-error.ts';
import { assertProviderConfigured } from './assert-provider-configured.helper.ts';
import { calculateAmountTotal } from './calculate-amount-total.helper.ts';
import { canTransition } from './can-transition.helper.ts';
import { toCheckoutView } from './to-checkout-view.helper.ts';

describe('calculateAmountTotal', () => {
	it('summiert Menge × Bruttopreis aller Positionen', () => {
		const items = [
			buildLineItem({ quantity: 2, unitAmount: 1190 }),
			buildLineItem({ quantity: 1, unitAmount: 500 })
		];

		expect(calculateAmountTotal(items)).toBe(2880);
	});

	it('liefert 0 für leere Listen', () => {
		expect(calculateAmountTotal([])).toBe(0);
	});
});

describe('canTransition', () => {
	it.each([
		['PENDING', 'SUCCEEDED', true],
		['PENDING', 'PROCESSING', true],
		['PROCESSING', 'SUCCEEDED', true],
		['PROCESSING', 'EXPIRED', false],
		['SUCCEEDED', 'FAILED', false],
		['SUCCEEDED', 'SUCCEEDED', false],
		['FAILED', 'SUCCEEDED', false]
	] as const)('%s → %s = %s', (from, to, expected) => {
		expect(canTransition(from, to)).toBe(expected);
	});
});

describe('assertProviderConfigured', () => {
	it('akzeptiert konfigurierte Provider', () => {
		expect(() => {
			assertProviderConfigured(buildCredentials(), 'stripe');
		}).not.toThrow();
	});

	it('wirft PROVIDER_NOT_CONFIGURED für fehlende Credentials', () => {
		const credentials = buildCredentials({ paypal: undefined });

		expect(() => {
			assertProviderConfigured(credentials, 'paypal');
		}).toThrow(expect.objectContaining({ code: 'PROVIDER_NOT_CONFIGURED' }) as DomainError);
	});
});

describe('toCheckoutView', () => {
	it('entfernt interne Felder und serialisiert Zeitstempel', () => {
		const checkout = buildCheckout();

		const view = toCheckoutView(checkout);

		expect(view).not.toHaveProperty('merchantId');
		expect(view.createdAt).toBe(checkout.createdAt.toISOString());
		expect(view.id).toBe(checkout.id);
	});
});
