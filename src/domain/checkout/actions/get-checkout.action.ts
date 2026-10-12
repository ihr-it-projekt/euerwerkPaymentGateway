import { DomainError } from '../../../shared/errors/domain-error.ts';
import type { CheckoutRepository } from '../models/checkout.repository.ts';
import type { Checkout } from '../models/checkout.schema.ts';

export class GetCheckoutAction {
	readonly #checkouts: CheckoutRepository;

	constructor(checkouts: CheckoutRepository) {
		this.#checkouts = checkouts;
	}

	async execute(merchantId: string, checkoutId: string): Promise<Checkout> {
		const checkout = await this.#checkouts.findById(merchantId, checkoutId);
		if (!checkout) {
			throw new DomainError('NOT_FOUND', 'Checkout nicht gefunden');
		}
		return checkout;
	}
}
