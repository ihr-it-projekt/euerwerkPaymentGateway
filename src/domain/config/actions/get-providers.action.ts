import { type ProviderName, ProviderNameSchema } from '../../checkout/models/checkout.schema.ts';
import type { PaymentConfigSource } from '../models/payment-config.port.ts';

export interface ProvidersResult {
	providers: ProviderName[];
}

/**
 * Zahlungsarten, die der Mandant in EÜRwerk eingerichtet hat – der Shop bietet nur diese an und
 * nutzt den Aufruf als Verbindungstest (ungültiger Key → 401).
 */
export class GetProvidersAction {
	readonly #configSource: PaymentConfigSource;

	constructor(configSource: PaymentConfigSource) {
		this.#configSource = configSource;
	}

	async execute(apiKey: string): Promise<ProvidersResult> {
		const config = await this.#configSource.load(apiKey);
		return {
			providers: ProviderNameSchema.options.filter((provider) => Boolean(config[provider]))
		};
	}
}
