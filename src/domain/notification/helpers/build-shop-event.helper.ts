import { randomUUID } from 'node:crypto';
import { toCheckoutView } from '../../checkout/helpers/to-checkout-view.helper.ts';
import type { Checkout, CheckoutStatus } from '../../checkout/models/checkout.schema.ts';
import type { ShopEvent, ShopEventType } from '../models/shop-notifier.port.ts';

const EVENT_TYPES: Record<Exclude<CheckoutStatus, 'PENDING'>, ShopEventType> = {
	PROCESSING: 'checkout.processing',
	SUCCEEDED: 'checkout.succeeded',
	FAILED: 'checkout.failed',
	EXPIRED: 'checkout.expired'
};

export const buildShopEvent = (
	checkout: Checkout & { status: Exclude<CheckoutStatus, 'PENDING'> },
	now: Date
): ShopEvent => ({
	id: randomUUID(),
	type: EVENT_TYPES[checkout.status],
	createdAt: now.toISOString(),
	data: toCheckoutView(checkout)
});
