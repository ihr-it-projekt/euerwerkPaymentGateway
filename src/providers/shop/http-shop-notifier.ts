import type { ShopNotifier } from '../../domain/notification/models/shop-notifier.port.ts';
import { signWebhookPayload } from '../../shared/crypto/sign-webhook-payload.helper.ts';
import { DomainError } from '../../shared/errors/domain-error.ts';

export const SIGNATURE_HEADER = 'X-Gateway-Signature';

/** Liefert Events per HTTP POST an den Shop, signiert mit dem Webhook-Secret des Merchants. */
export const createHttpShopNotifier = (now: () => Date = () => new Date()): ShopNotifier => ({
	notify: async (merchant, event) => {
		const body = JSON.stringify(event);
		const timestamp = Math.floor(now().getTime() / 1000);
		const response = await fetch(merchant.shopWebhookUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				[SIGNATURE_HEADER]: signWebhookPayload(
					merchant.credentials.webhookSigningSecret,
					body,
					timestamp
				)
			},
			body
		});
		if (!response.ok) {
			throw new DomainError('UPSTREAM_ERROR', `Shop antwortete mit ${response.status}`);
		}
	}
});
