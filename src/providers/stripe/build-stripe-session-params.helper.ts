import type Stripe from 'stripe';
import type {
	CheckoutRequest,
	ProviderName
} from '../../domain/checkout/models/checkout.schema.ts';
import { STRIPE_META } from './stripe-metadata.ts';

export const buildStripeSessionParams = (
	checkout: CheckoutRequest,
	provider: ProviderName
): Stripe.Checkout.SessionCreateParams => ({
	mode: 'payment',
	client_reference_id: checkout.reference,
	customer_email: checkout.customer.email,
	success_url: checkout.successUrl,
	cancel_url: checkout.cancelUrl,
	metadata: {
		...checkout.metadata,
		[STRIPE_META.provider]: provider,
		[STRIPE_META.reference]: checkout.reference,
		[STRIPE_META.contactId]: checkout.contactId
	},
	line_items: checkout.items.map((item) => ({
		quantity: item.quantity,
		price_data: {
			currency: checkout.currency.toLowerCase(),
			unit_amount: item.unitAmount,
			tax_behavior: 'inclusive',
			product_data: {
				name: item.name,
				metadata: { [STRIPE_META.taxRate]: String(item.taxRate) },
				...(item.description ? { description: item.description } : {})
			}
		}
	}))
});
