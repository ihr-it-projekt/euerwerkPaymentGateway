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

const toPaymentIntentId = (session: Stripe.Checkout.Session): string | null => {
	const intent = session.payment_intent;
	return typeof intent === 'string' ? intent : (intent?.id ?? null);
};

/** Stripe-Event → normalisiertes PaymentOutcome; `null` für irrelevante Events. */
export const mapStripeEvent = (event: Stripe.Event): PaymentOutcome | null => {
	const resolve = STATUS_RESOLVERS[event.type];
	if (!resolve) {
		return null;
	}
	const session = event.data.object as Stripe.Checkout.Session;
	return {
		providerReference: session.id,
		status: resolve(session),
		providerPaymentId: toPaymentIntentId(session)
	};
};
