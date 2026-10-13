import type { AppDependencies } from './app.ts';
import type { Env } from './config/env.ts';
import { BookPaymentAction } from './domain/accounting/actions/book-payment.action.ts';
import { CreateCheckoutAction } from './domain/checkout/actions/create-checkout.action.ts';
import { GetCheckoutAction } from './domain/checkout/actions/get-checkout.action.ts';
import { HandleProviderWebhookAction } from './domain/payment/actions/handle-provider-webhook.action.ts';
import type {
	PaymentProviderRegistry,
	WebhookProcessorRegistry
} from './domain/payment/models/payment-provider.port.ts';
import { GetWebhookEndpointsAction } from './domain/webhook/actions/get-webhook-endpoints.action.ts';
import { createEuerwerkAccountingGateway } from './providers/euerwerk/euerwerk-accounting.gateway.ts';
import { createEuerwerkConfigSource } from './providers/euerwerk/euerwerk-config.source.ts';
import { createPayPalApiClient } from './providers/paypal/paypal-api.client.ts';
import {
	createPayPalProvider,
	createPayPalWebhookProcessor
} from './providers/paypal/paypal.provider.ts';
import { createStripeClient } from './providers/stripe/stripe-client.ts';
import { createStripeWebhookProcessor } from './providers/stripe/stripe-webhook.processor.ts';
import { createStripeProvider } from './providers/stripe/stripe.provider.ts';
import { createWeroViaStripeProvider } from './providers/wero/wero-via-stripe.provider.ts';
import { createSecretCipher } from './shared/crypto/secret-cipher.ts';
import { createWebhookKeyCodec } from './shared/crypto/webhook-key-codec.ts';
import type { Logger } from './shared/logger/logger.ts';

export type GatewayConfig = Pick<
	Env,
	'ENCRYPTION_KEY' | 'PUBLIC_BASE_URL' | 'PAYPAL_API_BASE' | 'EUERWERK_API_BASE'
>;

interface PaymentRegistries {
	providers: PaymentProviderRegistry;
	webhookProcessors: WebhookProcessorRegistry;
}

/** Zahlungsarten und ihre Webhook-Kanäle. Wero läuft über Stripe als Acquirer. */
const buildPaymentRegistries = (config: GatewayConfig): PaymentRegistries => {
	const paypalApi = createPayPalApiClient(config.PAYPAL_API_BASE);
	return {
		providers: {
			stripe: createStripeProvider(createStripeClient),
			paypal: createPayPalProvider(paypalApi),
			wero: createWeroViaStripeProvider(createStripeClient)
		},
		webhookProcessors: {
			stripe: createStripeWebhookProcessor(createStripeClient),
			paypal: createPayPalWebhookProcessor(paypalApi)
		}
	};
};

/** Einziger Ort, an dem Adapter und Domain verdrahtet werden. Keine Datenhaltung. */
export const buildDependencies = (config: GatewayConfig, logger: Logger): AppDependencies => {
	const configSource = createEuerwerkConfigSource(config.EUERWERK_API_BASE);
	const accounting = createEuerwerkAccountingGateway(config.EUERWERK_API_BASE);
	const keyCodec = createWebhookKeyCodec(createSecretCipher(config.ENCRYPTION_KEY));
	const { providers, webhookProcessors } = buildPaymentRegistries(config);

	return {
		logger,
		checkout: {
			createCheckout: new CreateCheckoutAction({ configSource, accounting, providers }),
			getCheckout: new GetCheckoutAction({ configSource, providers })
		},
		getWebhookEndpoints: new GetWebhookEndpointsAction({
			configSource,
			keyCodec,
			publicBaseUrl: config.PUBLIC_BASE_URL
		}),
		handleWebhook: new HandleProviderWebhookAction({
			keyCodec,
			configSource,
			webhookProcessors,
			bookPayment: new BookPaymentAction(accounting),
			logger
		})
	};
};
