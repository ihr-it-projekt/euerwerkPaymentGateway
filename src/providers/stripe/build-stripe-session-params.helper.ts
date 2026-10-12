import type Stripe from 'stripe';
import type { Checkout } from '../../domain/checkout/models/checkout.schema.ts';

export const buildStripeSessionParams = (
	checkout: Checkout
): Stripe.Checkout.SessionCreateParams => ({
	mode: 'payment',
	client_reference_id: checkout.id,
	customer_email: checkout.customer.email,
	success_url: checkout.successUrl,
	cancel_url: checkout.cancelUrl,
	metadata: { ...checkout.metadata, checkoutId: checkout.id, reference: checkout.reference },
	line_items: checkout.items.map((item) => ({
		quantity: item.quantity,
		price_data: {
			currency: checkout.currency.toLowerCase(),
			unit_amount: item.unitAmount,
			tax_behavior: 'inclusive',
			product_data: {
				name: item.name,
				...(item.description ? { description: item.description } : {})
			}
		}
	}))
});
