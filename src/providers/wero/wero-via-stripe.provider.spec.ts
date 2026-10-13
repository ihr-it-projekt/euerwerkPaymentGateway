import { describe, expect, it } from 'vitest';
import { buildCheckoutRequest } from '#tests/factories/checkout.factory.ts';
import { buildPaymentConfig } from '#tests/factories/config.factory.ts';
import { requestLog } from '#tests/mock-server/request-log.ts';
import { PaymentConfigSchema } from '../../domain/config/models/payment-config.schema.ts';
import { createStripeClient } from '../stripe/stripe-client.ts';
import { assertWeroEligible } from './assert-wero-eligible.helper.ts';
import { createWeroViaStripeProvider } from './wero-via-stripe.provider.ts';

const provider = createWeroViaStripeProvider(createStripeClient);

describe('assertWeroEligible', () => {
	it('akzeptiert EUR ab 0,50 €', () => {
		expect(() => {
			assertWeroEligible({ currency: 'EUR', amountTotal: 50 });
		}).not.toThrow();
	});

	it.each([
		['andere Währung', { currency: 'USD', amountTotal: 1000 }, /EUR/],
		['zu kleiner Betrag', { currency: 'EUR', amountTotal: 49 }, /0,50/]
	])('lehnt ab: %s', (_label, checkout, message) => {
		expect(() => {
			assertWeroEligible(checkout);
		}).toThrow(message);
	});
});

describe('WeroViaStripeProvider', () => {
	it('meldet Status über den Stripe-Kanal und prüft Wero-Vorgaben', () => {
		expect(provider).toMatchObject({ name: 'wero', webhookSource: 'stripe' });
		expect(provider.assertEligible).toBe(assertWeroEligible);
	});

	it('erstellt eine Stripe Checkout Session, eingeschränkt auf Wero', async () => {
		const config = buildPaymentConfig();

		await provider.createCheckoutSession(buildCheckoutRequest(), config);

		const [call] = requestLog.find('POST', /\/v1\/checkout\/sessions$/);
		expect(call?.headers.get('authorization')).toBe(`Bearer ${config.stripe!.secretKey}`);
		expect(call?.body).toMatchObject({
			'allowed_payment_method_types[0]': 'wero',
			'metadata[pgw_provider]': 'wero'
		});
	});
});

describe('PaymentConfigSchema (Wero)', () => {
	it('verlangt Credentials des Acquirers', () => {
		const result = PaymentConfigSchema.safeParse(buildPaymentConfig({ stripe: null }));

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(['wero']);
	});

	it('setzt Stripe als Default-Acquirer und akzeptiert fehlende Provider', () => {
		const parsed = PaymentConfigSchema.parse({ stripe: buildPaymentConfig().stripe, wero: {} });

		expect(parsed).toMatchObject({ wero: { acquirer: 'stripe' } });
		expect(parsed.paypal).toBeUndefined();
	});
});
