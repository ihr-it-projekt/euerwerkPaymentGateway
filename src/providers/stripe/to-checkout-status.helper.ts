import type Stripe from 'stripe';
import type { CheckoutStatus } from '../../domain/checkout/models/checkout.schema.ts';

/** Schlüssel: `<session.status>:<payment_status>` bzw. nur `<session.status>`. */
const STATUS_BY_SESSION_STATE: Readonly<Record<string, CheckoutStatus>> = {
	'complete:paid': 'SUCCEEDED',
	'complete:no_payment_required': 'SUCCEEDED',
	// Asynchrone Zahlarten (z.B. SEPA): abgeschlossen, Geld aber noch nicht da
	'complete:unpaid': 'PROCESSING',
	open: 'PENDING',
	expired: 'EXPIRED'
};

export const toCheckoutStatus = (session: Stripe.Checkout.Session): CheckoutStatus => {
	const status = session.status ?? 'open';
	return (
		STATUS_BY_SESSION_STATE[`${status}:${session.payment_status}`] ??
		STATUS_BY_SESSION_STATE[status] ??
		'PENDING'
	);
};
