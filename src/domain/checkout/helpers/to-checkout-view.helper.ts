import type { Checkout } from '../models/checkout.schema.ts';

export type CheckoutView = Omit<Checkout, 'merchantId' | 'createdAt' | 'updatedAt'> & {
	createdAt: string;
	updatedAt: string;
};

/** Öffentliche Darstellung eines Checkouts (API-Antworten, Shop-Webhooks). */
export const toCheckoutView = (checkout: Checkout): CheckoutView => {
	const { merchantId: _merchantId, createdAt, updatedAt, ...rest } = checkout;
	return { ...rest, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
};
