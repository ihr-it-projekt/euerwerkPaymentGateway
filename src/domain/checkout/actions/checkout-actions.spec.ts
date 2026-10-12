import { faker } from '@faker-js/faker';
import { describe, expect, it, vi } from 'vitest';
import { buildCheckout, buildCreateCheckoutInput } from '#tests/factories/checkout.factory.ts';
import { buildCredentials, buildMerchant } from '#tests/factories/merchant.factory.ts';
import { createInMemoryCheckoutRepository } from '#tests/fakes/in-memory-checkout.repository.ts';
import { DomainError } from '../../../shared/errors/domain-error.ts';
import type {
	PaymentProvider,
	PaymentProviderRegistry
} from '../../payment/models/payment-provider.port.ts';
import type { ProviderName } from '../models/checkout.schema.ts';
import { CreateCheckoutAction } from './create-checkout.action.ts';
import { GetCheckoutAction } from './get-checkout.action.ts';

const fakeProvider = (name: ProviderName): PaymentProvider => ({
	name,
	webhookSource: 'stripe',
	createCheckoutSession: vi.fn(() =>
		Promise.resolve({ providerReference: faker.string.uuid(), redirectUrl: faker.internet.url() })
	)
});

const setup = () => {
	const checkouts = createInMemoryCheckoutRepository();
	const providers: PaymentProviderRegistry = {
		stripe: fakeProvider('stripe'),
		paypal: fakeProvider('paypal'),
		wero: {
			...fakeProvider('wero'),
			assertEligible: () => {
				throw new DomainError('VALIDATION_FAILED', 'nicht geeignet');
			}
		}
	};
	return { checkouts, providers, action: new CreateCheckoutAction({ checkouts, providers }) };
};

describe('CreateCheckoutAction', () => {
	it('speichert den Checkout und verknüpft die Provider-Session', async () => {
		const { action, providers, checkouts } = setup();
		const merchant = buildMerchant();
		const input = buildCreateCheckoutInput({ provider: 'paypal' });

		const checkout = await action.execute(merchant, input);

		expect(providers.paypal.createCheckoutSession).toHaveBeenCalledOnce();
		expect(providers.stripe.createCheckoutSession).not.toHaveBeenCalled();
		expect(checkout).toMatchObject({
			merchantId: merchant.id,
			status: 'PENDING',
			provider: 'paypal'
		});
		expect(checkout.redirectUrl).toEqual(expect.any(String));
		expect(checkouts.items.get(checkout.id)?.providerReference).toBe(checkout.providerReference);
	});

	it('setzt accountingStatus abhängig von der Merchant-Konfiguration', async () => {
		const { action } = setup();
		const merchant = buildMerchant({ credentials: buildCredentials({ accounting: undefined }) });

		const checkout = await action.execute(merchant, buildCreateCheckoutInput());

		expect(checkout.accountingStatus).toBe('NOT_REQUIRED');
	});

	it('wirft PROVIDER_NOT_CONFIGURED, ohne etwas zu speichern', async () => {
		const { action, checkouts } = setup();
		const merchant = buildMerchant({ credentials: buildCredentials({ stripe: undefined }) });

		await expect(
			action.execute(merchant, buildCreateCheckoutInput({ provider: 'stripe' }))
		).rejects.toMatchObject({
			code: 'PROVIDER_NOT_CONFIGURED'
		});
		expect(checkouts.items.size).toBe(0);
	});

	it('prüft Provider-Vorgaben vor dem Speichern', async () => {
		const { action, providers, checkouts } = setup();

		await expect(
			action.execute(buildMerchant(), buildCreateCheckoutInput({ provider: 'wero' }))
		).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
		expect(providers.wero.createCheckoutSession).not.toHaveBeenCalled();
		expect(checkouts.items.size).toBe(0);
	});

	it('markiert den Checkout als FAILED, wenn der Provider scheitert', async () => {
		const { action, providers, checkouts } = setup();
		vi.mocked(providers.stripe.createCheckoutSession).mockRejectedValueOnce(
			new DomainError('UPSTREAM_ERROR', 'down')
		);

		await expect(action.execute(buildMerchant(), buildCreateCheckoutInput())).rejects.toThrow(
			'down'
		);
		expect([...checkouts.items.values()][0]?.status).toBe('FAILED');
	});
});

describe('GetCheckoutAction', () => {
	it('liefert den Checkout des Merchants', async () => {
		const checkout = buildCheckout();
		const action = new GetCheckoutAction(createInMemoryCheckoutRepository([checkout]));

		expect(await action.execute(checkout.merchantId, checkout.id)).toBe(checkout);
	});

	it('wirft NOT_FOUND für fremde oder unbekannte Checkouts', async () => {
		const checkout = buildCheckout();
		const action = new GetCheckoutAction(createInMemoryCheckoutRepository([checkout]));

		await expect(action.execute(faker.string.uuid(), checkout.id)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});
