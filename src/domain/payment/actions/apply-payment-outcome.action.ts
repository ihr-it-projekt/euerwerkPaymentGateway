import type { Logger } from '../../../shared/logger/logger.ts';
import type { BookCheckoutInAccountingAction } from '../../accounting/actions/book-checkout-in-accounting.action.ts';
import { canTransition } from '../../checkout/helpers/can-transition.helper.ts';
import type { CheckoutRepository } from '../../checkout/models/checkout.repository.ts';
import type { Checkout, ProviderName } from '../../checkout/models/checkout.schema.ts';
import type { Merchant } from '../../merchant/models/merchant.schema.ts';
import { buildShopEvent } from '../../notification/helpers/build-shop-event.helper.ts';
import type { ShopNotifier } from '../../notification/models/shop-notifier.port.ts';
import type { PaymentOutcome } from '../models/payment-provider.port.ts';

interface Dependencies {
	checkouts: CheckoutRepository;
	bookInAccounting: Pick<BookCheckoutInAccountingAction, 'execute'>;
	notifier: ShopNotifier;
	logger: Logger;
}

export type ApplyResult = 'APPLIED' | 'IGNORED_UNKNOWN' | 'IGNORED_DUPLICATE';

/**
 * Übernimmt ein Provider-Ergebnis: Status setzen → (bei Erfolg) buchen → Shop benachrichtigen.
 * Idempotent: unzulässige Übergänge (z.B. doppelte Webhooks) werden ignoriert.
 */
export class ApplyPaymentOutcomeAction {
	readonly #deps: Dependencies;

	constructor(deps: Dependencies) {
		this.#deps = deps;
	}

	async execute(
		merchant: Merchant,
		providers: readonly ProviderName[],
		outcome: PaymentOutcome
	): Promise<ApplyResult> {
		const { checkouts, logger } = this.#deps;
		const checkout = await checkouts.findByProviderReference(
			merchant.id,
			providers,
			outcome.providerReference
		);
		if (!checkout) {
			logger.warn('Webhook für unbekannten Checkout', { providers, ...outcome });
			return 'IGNORED_UNKNOWN';
		}
		if (!canTransition(checkout.status, outcome.status)) {
			return 'IGNORED_DUPLICATE';
		}
		const updated = await checkouts.updateStatus(checkout.id, {
			status: outcome.status,
			providerPaymentId: outcome.providerPaymentId
		});
		const final = await this.#bookIfSucceeded(merchant, updated);
		await this.#notifyShop(merchant, { ...final, status: outcome.status });
		return 'APPLIED';
	}

	async #bookIfSucceeded(merchant: Merchant, checkout: Checkout): Promise<Checkout> {
		return checkout.status === 'SUCCEEDED'
			? this.#deps.bookInAccounting.execute(merchant, checkout)
			: checkout;
	}

	async #notifyShop(
		merchant: Merchant,
		checkout: Checkout & { status: PaymentOutcome['status'] }
	): Promise<void> {
		try {
			await this.#deps.notifier.notify(merchant, buildShopEvent(checkout, new Date()));
		} catch (error) {
			// TODO(outbox): Zustellung persistieren und mit Backoff wiederholen – siehe docs/OPEN_POINTS.md
			this.#deps.logger.error('Shop-Webhook fehlgeschlagen', {
				checkoutId: checkout.id,
				error: String(error)
			});
		}
	}
}
