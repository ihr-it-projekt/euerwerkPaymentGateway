import { describe, expect, it } from 'vitest';
import { buildCreateCheckoutInput } from '#tests/factories/checkout.factory.ts';
import { buildPaymentConfig } from '#tests/factories/config.factory.ts';
import {
	fakeAccounting,
	fakeApiKey,
	fakeConfigSource,
	fakeProviderRegistry
} from '#tests/fakes/domain-fakes.ts';
import { CreateCheckoutAction } from './create-checkout.action.ts';
import { GetCheckoutAction } from './get-checkout.action.ts';

const apiKey = fakeApiKey();

describe('CreateCheckoutAction', () => {
	it('lädt die Konfiguration, legt den Kontakt an und übergibt alles an den Provider', async () => {
		const providers = fakeProviderRegistry();
		const accounting = fakeAccounting();
		const source = fakeConfigSource();
		const input = buildCreateCheckoutInput({
			provider: 'stripe',
			items: [{ name: 'A', quantity: 2, unitNetAmount: 500, taxRate: 19 }]
		});

		const view = await new CreateCheckoutAction({
			configSource: source,
			accounting,
			providers
		}).execute(apiKey, input);

		expect(source.load).toHaveBeenCalledWith(apiKey);
		expect(accounting.upsertContact).toHaveBeenCalledWith(apiKey, input.customer);
		expect(providers.stripe.createCheckoutSession).toHaveBeenCalledWith(
			expect.objectContaining({ amountNet: 1000, amountTotal: 1190, contactId: 'contact-1' }),
			expect.anything()
		);
		expect(view).toMatchObject({
			id: 'stripe.cs_test_1',
			status: 'PENDING',
			amountNet: 1000,
			amountTax: 190,
			amountTotal: 1190
		});
	});

	it.each([
		[
			'nicht konfigurierter Provider',
			'paypal',
			buildPaymentConfig({ paypal: null }),
			'PROVIDER_NOT_CONFIGURED'
		],
		['Provider-Vorgaben verletzt', 'wero', buildPaymentConfig(), 'VALIDATION_FAILED']
	] as const)('bricht ab vor Kontakt-Anlage: %s', async (_label, provider, config, code) => {
		const accounting = fakeAccounting();
		const action = new CreateCheckoutAction({
			configSource: fakeConfigSource(config),
			accounting,
			providers: fakeProviderRegistry()
		});

		await expect(
			action.execute(apiKey, buildCreateCheckoutInput({ provider }))
		).rejects.toMatchObject({
			code
		});
		expect(accounting.upsertContact).not.toHaveBeenCalled();
	});
});

describe('GetCheckoutAction', () => {
	it('fragt den richtigen Provider mit der Provider-Referenz ab', async () => {
		const providers = fakeProviderRegistry();
		const action = new GetCheckoutAction({ configSource: fakeConfigSource(), providers });

		await action.execute(apiKey, 'wero.cs_test_9');

		expect(providers.wero.getCheckout).toHaveBeenCalledWith('cs_test_9', expect.anything());
	});

	it('prüft die ID vor jedem Upstream-Aufruf', async () => {
		const source = fakeConfigSource();
		const action = new GetCheckoutAction({
			configSource: source,
			providers: fakeProviderRegistry()
		});

		await expect(action.execute(apiKey, 'unsinn')).rejects.toMatchObject({ code: 'NOT_FOUND' });
		expect(source.load).not.toHaveBeenCalled();
	});
});
