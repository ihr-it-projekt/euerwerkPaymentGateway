import type {
	CheckoutRequest,
	CheckoutStatus,
	CheckoutView,
	PaymentRecord,
	ProviderName,
	WebhookSource
} from '../../checkout/models/checkout.schema.ts';
import type { PaymentConfig } from '../../config/models/payment-config.schema.ts';

export interface ProviderCheckoutSession {
	providerReference: string;
	redirectUrl: string;
}

export interface WebhookRequest {
	rawBody: string;
	headers: Record<string, string>;
}

/**
 * Normalisiertes Ergebnis eines Provider-Webhooks.
 * Bei `SUCCEEDED` enthält `payment` alle Daten zum Buchen (vom Provider nachgeladen).
 */
export interface PaymentOutcome {
	providerReference: string;
	status: Exclude<CheckoutStatus, 'PENDING'>;
	payment: PaymentRecord | null;
}

/**
 * Zahlungsart aus Sicht des Shops (Stripe, PayPal, Wero, …).
 * `webhookSource` legt fest, über welchen Webhook-Kanal Statusänderungen eintreffen –
 * z.B. läuft Wero technisch über Stripe und meldet sich daher über den Stripe-Webhook.
 */
export interface PaymentProvider {
	readonly name: ProviderName;
	readonly webhookSource: WebhookSource;
	/** Provider-spezifische Vorgaben (z.B. Währung, Mindestbetrag) – wirft `VALIDATION_FAILED`. */
	assertEligible?: (checkout: Pick<CheckoutRequest, 'currency' | 'amountTotal'>) => void;
	createCheckoutSession: (
		checkout: CheckoutRequest,
		config: PaymentConfig
	) => Promise<ProviderCheckoutSession>;
	/** Live-Status beim Provider; wirft `NOT_FOUND`, wenn die Referenz nicht existiert. */
	getCheckout: (providerReference: string, config: PaymentConfig) => Promise<CheckoutView>;
}

/** Verarbeitet eingehende Webhooks eines Kanals (= Acquirer/PSP-Account). */
export interface WebhookProcessor {
	readonly source: WebhookSource;
	/**
	 * Verifiziert die Signatur und übersetzt das Event.
	 * `null` = Event ist für das Gateway irrelevant.
	 * Wirft `DomainError('INVALID_WEBHOOK_SIGNATURE')` bei ungültiger Signatur.
	 */
	processWebhook: (
		request: WebhookRequest,
		config: PaymentConfig
	) => Promise<PaymentOutcome | null>;
}

export type PaymentProviderRegistry = Readonly<Record<ProviderName, PaymentProvider>>;
export type WebhookProcessorRegistry = Readonly<Record<WebhookSource, WebhookProcessor>>;
