import type Stripe from 'stripe';
import type { PaymentOutcome } from '../../domain/payment/models/payment-provider.port.ts';

type OutcomeStatus = PaymentOutcome['status'];
type StatusResolver = (session: Stripe.Checkout.Session) => OutcomeStatus;

const STATUS_RESOLVERS: Partial<Record<Stripe.Event['type'], StatusResolver>> = {
	// Asynchrone Zahlarten (z.B. SEPA) melden "completed" mit payment_status=unpaid
	'checkout.session.completed': (session) =>
		session.payment_status === 'unpaid' ? 'PROCESSING' : 'SUCCEEDED',
	'checkout.session.async_payment_succeeded': () => 'SUCCEEDED',
	'checkout.session.async_payment_failed': () => 'FAILED',
	'checkout.session.expired': () => 'EXPIRED'
};

export interface StripeSessionEvent {
	status: OutcomeStatus;
	session: Stripe.Checkout.Session;
}

/** Relevante Checkout-Session-Events; `null` für alle anderen. */
export const mapStripeEvent = (event: Stripe.Event): StripeSessionEvent | null => {
	const resolve = STATUS_RESOLVERS[event.type];
	if (!resolve) {
		return null;
	}
	const session = event.data.object as Stripe.Checkout.Session;
	return { status: resolve(session), session };
};
