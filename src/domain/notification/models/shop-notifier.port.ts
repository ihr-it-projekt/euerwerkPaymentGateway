import type { CheckoutView } from '../../checkout/helpers/to-checkout-view.helper.ts';
import type { Merchant } from '../../merchant/models/merchant.schema.ts';

export type ShopEventType =
	'checkout.processing' | 'checkout.succeeded' | 'checkout.failed' | 'checkout.expired';

export interface ShopEvent {
	id: string;
	type: ShopEventType;
	createdAt: string;
	data: CheckoutView;
}

export interface ShopNotifier {
	notify: (merchant: Merchant, event: ShopEvent) => Promise<void>;
}
