import type { AppDependencies } from './app.ts';
import type { Env } from './config/env.ts';
import { BookCheckoutInAccountingAction } from './domain/accounting/actions/book-checkout-in-accounting.action.ts';
import { CreateCheckoutAction } from './domain/checkout/actions/create-checkout.action.ts';
import { GetCheckoutAction } from './domain/checkout/actions/get-checkout.action.ts';
import { AuthenticateMerchantAction } from './domain/merchant/actions/authenticate-merchant.action.ts';
import { CreateMerchantAction } from './domain/merchant/actions/create-merchant.action.ts';
import { ApplyPaymentOutcomeAction } from './domain/payment/actions/apply-payment-outcome.action.ts';
import { HandleProviderWebhookAction } from './domain/payment/actions/handle-provider-webhook.action.ts';
import type {
	PaymentProviderRegistry,
	WebhookProcessorRegistry
} from './domain/payment/models/payment-provider.port.ts';
import type { Database } from './infrastructure/db/database.ts';
import { createDrizzleAccountingContactRepository } from './infrastructure/db/repositories/drizzle-accounting-contact.repository.ts';
import { createDrizzleCheckoutRepository } from './infrastructure/db/repositories/drizzle-checkout.repository.ts';
import { createDrizzleMerchantRepository } from './infrastructure/db/repositories/drizzle-merchant.repository.ts';
import { createEuerwerkAccountingGateway } from './providers/euerwerk/euerwerk-accounting.gateway.ts';
import { createPayPalApiClient } from './providers/paypal/paypal-api.client.ts';
import {
	createPayPalProvider,
	createPayPalWebhookProcessor
} from './providers/paypal/paypal.provider.ts';
import { createHttpShopNotifier } from './providers/shop/http-shop-notifier.ts';
import { createStripeClient } from './providers/stripe/stripe-client.ts';
import { createStripeWebhookProcessor } from './providers/stripe/stripe-webhook.processor.ts';
import { createStripeProvider } from './providers/stripe/stripe.provider.ts';
import { createWeroViaStripeProvider } from './providers/wero/wero-via-stripe.provider.ts';
import { createSecretCipher } from './shared/crypto/secret-cipher.ts';
import type { Logger } from './shared/logger/logger.ts';

export type GatewayConfig = Pick<
	Env,
	'ENCRYPTION_KEY' | 'ADMIN_API_KEY' | 'PUBLIC_BASE_URL' | 'PAYPAL_API_BASE' | 'EUERWERK_API_BASE'
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

/** Einziger Ort, an dem Infrastruktur und Domain verdrahtet werden. */
export const buildDependencies = (
	config: GatewayConfig,
	db: Database,
	logger: Logger
): AppDependencies => {
	const merchants = createDrizzleMerchantRepository(db, createSecretCipher(config.ENCRYPTION_KEY));
	const checkouts = createDrizzleCheckoutRepository(db);
	const { providers, webhookProcessors } = buildPaymentRegistries(config);
	const bookInAccounting = new BookCheckoutInAccountingAction({
		checkouts,
		accounting: createEuerwerkAccountingGateway(config.EUERWERK_API_BASE),
		contacts: createDrizzleAccountingContactRepository(db),
		logger
	});
	const applyOutcome = new ApplyPaymentOutcomeAction({
		checkouts,
		bookInAccounting,
		notifier: createHttpShopNotifier(),
		logger
	});

	return {
		logger,
		checkout: {
			authenticate: new AuthenticateMerchantAction(merchants),
			createCheckout: new CreateCheckoutAction({ checkouts, providers }),
			getCheckout: new GetCheckoutAction(checkouts)
		},
		admin: {
			adminApiKey: config.ADMIN_API_KEY,
			publicBaseUrl: config.PUBLIC_BASE_URL,
			createMerchant: new CreateMerchantAction(merchants)
		},
		handleWebhook: new HandleProviderWebhookAction({
			merchants,
			providers,
			webhookProcessors,
			applyOutcome
		})
	};
};
