import { describe, expect, it } from 'vitest';
import { buildCheckout } from '#tests/factories/checkout.factory.ts';
import { buildCredentials } from '#tests/factories/merchant.factory.ts';
import { requestLog } from '#tests/mock-server/request-log.ts';
import { MerchantCredentialsSchema } from '../../domain/merchant/models/merchant.schema.ts';
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
	it('meldet Status über den Stripe-Webhook-Kanal', () => {
		expect(provider).toMatchObject({ name: 'wero', webhookSource: 'stripe' });
	});

	it('erstellt eine Stripe Checkout Session, eingeschränkt auf Wero', async () => {
		const checkout = buildCheckout({ provider: 'wero' });
		const credentials = buildCredentials();

		const session = await provider.createCheckoutSession(checkout, credentials);

		expect(session.redirectUrl).toContain(session.providerReference);
		const [call] = requestLog.find('POST', /\/v1\/checkout\/sessions$/);
		expect(call?.headers.get('authorization')).toBe(`Bearer ${credentials.stripe!.secretKey}`);
		expect(call?.headers.get('idempotency-key')).toBe(`checkout-${checkout.id}`);
		expect(call?.body).toMatchObject({
			mode: 'payment',
			'allowed_payment_method_types[0]': 'wero',
			'line_items[0][price_data][currency]': 'eur'
		});
	});

	it('wirft PROVIDER_NOT_CONFIGURED ohne Stripe-Credentials', async () => {
		await expect(
			provider.createCheckoutSession(buildCheckout(), buildCredentials({ stripe: undefined }))
		).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
	});
});

describe('Wero-Merchant-Konfiguration', () => {
	it('verlangt Credentials des Acquirers', () => {
		const withoutStripe = buildCredentials({ stripe: undefined });

		const result = MerchantCredentialsSchema.safeParse(withoutStripe);

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(['wero']);
	});

	it('setzt Stripe als Default-Acquirer', () => {
		const parsed = MerchantCredentialsSchema.parse({ ...buildCredentials(), wero: {} });

		expect(parsed.wero).toEqual({ acquirer: 'stripe' });
	});
});
