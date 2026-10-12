import type { CheckoutStatus } from '../models/checkout.schema.ts';

const ALLOWED_TRANSITIONS: Record<CheckoutStatus, readonly CheckoutStatus[]> = {
	PENDING: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED'],
	PROCESSING: ['SUCCEEDED', 'FAILED'],
	SUCCEEDED: [],
	FAILED: [],
	EXPIRED: []
};

/** Statusmaschine: Endzustände sind final, doppelte Webhooks werden so idempotent. */
export const canTransition = (from: CheckoutStatus, to: CheckoutStatus): boolean =>
	ALLOWED_TRANSITIONS[from].includes(to);
