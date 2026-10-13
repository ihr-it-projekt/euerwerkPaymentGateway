import type Stripe from 'stripe';
import { z } from 'zod';
import { formatCheckoutId } from '../../domain/checkout/helpers/checkout-id.helper.ts';
import {
	type CheckoutView,
	type LineItem,
	type PaymentRecord,
	ProviderNameSchema,
	TaxRateSchema
} from '../../domain/checkout/models/checkout.schema.ts';
import { callStripe } from './stripe-client.ts';
import { STRIPE_META } from './stripe-metadata.ts';
import { toCheckoutStatus } from './to-checkout-status.helper.ts';

const GatewayMetadataSchema = z.object({
	[STRIPE_META.provider]: ProviderNameSchema,
	[STRIPE_META.reference]: z.string().min(1),
	[STRIPE_META.contactId]: z.string().min(1)
});

const ProductSchema = z.object({
	name: z.string(),
	description: z.string().nullish(),
	metadata: z.object({ [STRIPE_META.taxRate]: z.coerce.number().pipe(TaxRateSchema) })
});

export interface GatewaySession {
	session: Stripe.Checkout.Session;
	provider: z.infer<typeof ProviderNameSchema>;
	reference: string;
	contactId: string;
}

/** Nur vom Gateway erzeugte Sessions haben die Metadaten – fremde Sessions → `null`. */
export const readGatewaySession = (session: Stripe.Checkout.Session): GatewaySession | null => {
	const parsed = GatewayMetadataSchema.safeParse(session.metadata ?? {});
	if (!parsed.success) {
		return null;
	}
	return {
		session,
		provider: parsed.data[STRIPE_META.provider],
		reference: parsed.data[STRIPE_META.reference],
		contactId: parsed.data[STRIPE_META.contactId]
	};
};

const toPaymentIntentId = (session: Stripe.Checkout.Session): string | null => {
	const intent = session.payment_intent;
	return typeof intent === 'string' ? intent : (intent?.id ?? null);
};

export const toStripeCheckoutView = (gateway: GatewaySession): CheckoutView => ({
	id: formatCheckoutId(gateway.provider, gateway.session.id),
	provider: gateway.provider,
	status: toCheckoutStatus(gateway.session),
	reference: gateway.reference,
	currency: (gateway.session.currency ?? 'eur').toUpperCase(),
	amountTotal: gateway.session.amount_total ?? 0,
	redirectUrl: gateway.session.url,
	providerPaymentId: toPaymentIntentId(gateway.session)
});

/** Erwartete Struktur bei `expand: ['data.price.product']` – Abweichungen sind ein Fehler. */
const StripeLineItemSchema = z.object({
	description: z.string().nullish(),
	quantity: z.int().positive(),
	price: z.object({ unit_amount: z.int().nonnegative(), product: ProductSchema })
});

const toLineItem = (raw: Stripe.LineItem): LineItem => {
	const item = StripeLineItemSchema.parse(raw);
	const { product } = item.price;
	return {
		name: item.description ?? product.name,
		...(product.description ? { description: product.description } : {}),
		quantity: item.quantity,
		unitAmount: item.price.unit_amount,
		taxRate: product.metadata[STRIPE_META.taxRate]
	};
};

/** Positionen samt Steuersatz (Produkt-Metadaten) nachladen → Buchungsgrundlage. */
export const loadStripePaymentRecord = async (
	client: Stripe,
	gateway: GatewaySession
): Promise<PaymentRecord> => {
	const lineItems = await callStripe(
		client.checkout.sessions.listLineItems(gateway.session.id, {
			limit: 100,
			expand: ['data.price.product']
		})
	);
	const view = toStripeCheckoutView(gateway);
	return {
		checkoutId: view.id,
		provider: gateway.provider,
		reference: gateway.reference,
		contactId: gateway.contactId,
		currency: view.currency,
		amountTotal: view.amountTotal,
		items: lineItems.data.map(toLineItem),
		providerPaymentId: view.providerPaymentId
	};
};
