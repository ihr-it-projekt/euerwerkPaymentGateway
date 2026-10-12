import { faker } from '@faker-js/faker';
import { describe, expect, it, vi } from 'vitest';
import { buildCheckout } from '#tests/factories/checkout.factory.ts';
import { buildCredentials, buildMerchant } from '#tests/factories/merchant.factory.ts';
import { createInMemoryCheckoutRepository } from '#tests/fakes/in-memory-checkout.repository.ts';
import { createInMemoryMerchantRepository } from '#tests/fakes/in-memory-merchant.repository.ts';
import { silentLogger } from '../../../shared/logger/logger.ts';
import type { Checkout } from '../../checkout/models/checkout.schema.ts';
import type {
	PaymentOutcome,
	PaymentProviderRegistry,
	WebhookProcessorRegistry
} from '../models/payment-provider.port.ts';
import { ApplyPaymentOutcomeAction } from './apply-payment-outcome.action.ts';
import { HandleProviderWebhookAction } from './handle-provider-webhook.action.ts';

const setupApply = (checkout: Checkout) => {
	const checkouts = createInMemoryCheckoutRepository([checkout]);
	const bookInAccounting = {
		execute: vi.fn((_merchant: unknown, c: Checkout) =>
			Promise.resolve({ ...c, accountingStatus: 'BOOKED' as const })
		)
	};
	const notifier = { notify: vi.fn(() => Promise.resolve()) };
	const logger = { ...silentLogger, error: vi.fn() };
	const action = new ApplyPaymentOutcomeAction({ checkouts, bookInAccounting, notifier, logger });
	return { action, checkouts, bookInAccounting, notifier, logger };
};

const outcomeFor = (checkout: Checkout, status: PaymentOutcome['status']): PaymentOutcome => ({
	providerReference: checkout.providerReference!,
	status,
	providerPaymentId: 'pi_123'
});

describe('ApplyPaymentOutcomeAction', () => {
	it('bucht bei SUCCEEDED und benachrichtigt den Shop mit dem gebuchten Stand', async () => {
		const merchant = buildMerchant();
		const checkout = buildCheckout({ merchantId: merchant.id });
		const { action, bookInAccounting, notifier, checkouts } = setupApply(checkout);

		const result = await action.execute(merchant, ['stripe'], outcomeFor(checkout, 'SUCCEEDED'));

		expect(result).toBe('APPLIED');
		expect(checkouts.items.get(checkout.id)).toMatchObject({
			status: 'SUCCEEDED',
			providerPaymentId: 'pi_123'
		});
		expect(bookInAccounting.execute).toHaveBeenCalledOnce();
		expect(notifier.notify).toHaveBeenCalledWith(
			merchant,
			expect.objectContaining({
				type: 'checkout.succeeded',
				data: expect.objectContaining({ accountingStatus: 'BOOKED' }) as unknown
			})
		);
	});

	it.each(['FAILED', 'EXPIRED', 'PROCESSING'] as const)('bucht nicht bei %s', async (status) => {
		const merchant = buildMerchant();
		const checkout = buildCheckout({ merchantId: merchant.id });
		const { action, bookInAccounting, notifier } = setupApply(checkout);

		await action.execute(merchant, ['stripe'], outcomeFor(checkout, status));

		expect(bookInAccounting.execute).not.toHaveBeenCalled();
		expect(notifier.notify).toHaveBeenCalledWith(
			merchant,
			expect.objectContaining({ type: `checkout.${status.toLowerCase()}` })
		);
	});

	it('findet Wero-Checkouts über den Stripe-Kanal, aber nicht über PayPal', async () => {
		const merchant = buildMerchant();
		const checkout = buildCheckout({ merchantId: merchant.id, provider: 'wero' });
		const { action } = setupApply(checkout);

		const viaPayPal = await action.execute(merchant, ['paypal'], outcomeFor(checkout, 'SUCCEEDED'));
		const viaStripe = await action.execute(
			merchant,
			['stripe', 'wero'],
			outcomeFor(checkout, 'SUCCEEDED')
		);

		expect([viaPayPal, viaStripe]).toEqual(['IGNORED_UNKNOWN', 'APPLIED']);
	});

	it('ignoriert unbekannte Referenzen und unzulässige Übergänge', async () => {
		const merchant = buildMerchant();
		const checkout = buildCheckout({ merchantId: merchant.id, status: 'SUCCEEDED' });
		const { action, notifier } = setupApply(checkout);

		const duplicate = await action.execute(merchant, ['stripe'], outcomeFor(checkout, 'SUCCEEDED'));
		const unknown = await action.execute(merchant, ['stripe'], {
			...outcomeFor(checkout, 'SUCCEEDED'),
			providerReference: 'cs_unbekannt'
		});

		expect([duplicate, unknown]).toEqual(['IGNORED_DUPLICATE', 'IGNORED_UNKNOWN']);
		expect(notifier.notify).not.toHaveBeenCalled();
	});

	it('loggt fehlgeschlagene Shop-Benachrichtigungen, ohne zu werfen', async () => {
		const merchant = buildMerchant();
		const checkout = buildCheckout({ merchantId: merchant.id });
		const { action, notifier, logger } = setupApply(checkout);
		notifier.notify.mockRejectedValueOnce(new Error('Shop down'));

		await expect(
			action.execute(merchant, ['stripe'], outcomeFor(checkout, 'FAILED'))
		).resolves.toBe('APPLIED');
		expect(logger.error).toHaveBeenCalledOnce();
	});
});

describe('HandleProviderWebhookAction', () => {
	const setupHandle = (outcome: PaymentOutcome | null) => {
		const merchant = buildMerchant();
		const processWebhook = vi.fn(() => Promise.resolve(outcome));
		const provider = (name: string, webhookSource: string) => ({
			name,
			webhookSource,
			createCheckoutSession: vi.fn()
		});
		const providers = {
			stripe: provider('stripe', 'stripe'),
			paypal: provider('paypal', 'paypal'),
			wero: provider('wero', 'stripe')
		} as unknown as PaymentProviderRegistry;
		const webhookProcessors: WebhookProcessorRegistry = {
			stripe: { source: 'stripe', processWebhook },
			paypal: { source: 'paypal', processWebhook: vi.fn() }
		};
		const applyOutcome = { execute: vi.fn(() => Promise.resolve('APPLIED' as const)) };
		const action = new HandleProviderWebhookAction({
			merchants: createInMemoryMerchantRepository([{ merchant, apiKeyHash: 'x' }]),
			providers,
			webhookProcessors,
			applyOutcome
		});
		return { action, merchant, processWebhook, applyOutcome };
	};
	const request = { rawBody: '{}', headers: {} };

	it('verarbeitet das Event und sucht unter allen Providern des Kanals (stripe + wero)', async () => {
		const outcome: PaymentOutcome = {
			providerReference: 'cs_1',
			status: 'SUCCEEDED',
			providerPaymentId: null
		};
		const { action, merchant, applyOutcome } = setupHandle(outcome);

		const result = await action.execute({ source: 'stripe', merchantId: merchant.id, request });

		expect(result).toBe('APPLIED');
		expect(applyOutcome.execute).toHaveBeenCalledWith(merchant, ['stripe', 'wero'], outcome);
	});

	it('meldet IGNORED_EVENT für irrelevante Events', async () => {
		const { action, merchant, applyOutcome } = setupHandle(null);

		expect(await action.execute({ source: 'stripe', merchantId: merchant.id, request })).toBe(
			'IGNORED_EVENT'
		);
		expect(applyOutcome.execute).not.toHaveBeenCalled();
	});

	it('wirft NOT_FOUND für unbekannte Merchants', async () => {
		const { action } = setupHandle(null);

		await expect(
			action.execute({ source: 'stripe', merchantId: faker.string.uuid(), request })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('wirft NOT_FOUND, wenn der Merchant den Provider nicht nutzt', async () => {
		const { action, merchant } = setupHandle(null);
		merchant.credentials = buildCredentials({ paypal: undefined });

		await expect(
			action.execute({ source: 'paypal', merchantId: merchant.id, request })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
