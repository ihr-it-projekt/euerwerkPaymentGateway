import { describe, expect, it } from 'vitest';
import { buildCheckout } from '#tests/factories/checkout.factory.ts';
import { buildMerchant } from '#tests/factories/merchant.factory.ts';
import { shopFailingHandler } from '#tests/mock-server/handlers/shop.handlers.ts';
import { requestLog } from '#tests/mock-server/request-log.ts';
import { mockServer } from '#tests/mock-server/server.ts';
import { buildShopEvent } from '../../domain/notification/helpers/build-shop-event.helper.ts';
import { verifyWebhookSignature } from '../../shared/crypto/verify-webhook-signature.helper.ts';
import { createHttpShopNotifier } from './http-shop-notifier.ts';

const now = new Date('2026-10-12T12:00:00Z');
const notifier = createHttpShopNotifier(() => now);

describe('HttpShopNotifier', () => {
	it('sendet signierte Events an die Shop-URL des Merchants', async () => {
		const merchant = buildMerchant();
		const event = buildShopEvent({ ...buildCheckout(), status: 'SUCCEEDED' }, now);

		await notifier.notify(merchant, event);

		const [call] = requestLog.find('POST', /payment-gateway\/webhook$/);
		expect(call?.body).toEqual(event);
		expect(
			verifyWebhookSignature({
				secret: merchant.credentials.webhookSigningSecret,
				body: JSON.stringify(event),
				header: call?.headers.get('x-gateway-signature') ?? '',
				nowSeconds: now.getTime() / 1000
			})
		).toBe(true);
	});

	it('wirft bei Fehlerantworten des Shops', async () => {
		mockServer.use(shopFailingHandler());
		const event = buildShopEvent({ ...buildCheckout(), status: 'FAILED' }, now);

		await expect(notifier.notify(buildMerchant(), event)).rejects.toMatchObject({
			code: 'UPSTREAM_ERROR'
		});
	});
});
