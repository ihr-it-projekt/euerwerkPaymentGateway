import type { PaymentConfigSource } from '../../domain/config/models/payment-config.port.ts';
import { PaymentConfigSchema } from '../../domain/config/models/payment-config.schema.ts';
import { fetchJson } from '../../shared/http/fetch-json.helper.ts';
import { euerwerkRequest } from './euerwerk-request.helper.ts';

/**
 * Lädt die Zahlungs-Konfiguration des Mandanten aus EÜRwerk (TASK-PGW-06).
 * Bewusst ohne Cache: Änderungen und Key-Widerrufe greifen sofort.
 */
export const createEuerwerkConfigSource = (baseUrl: string): PaymentConfigSource => ({
	load: async (apiKey) => {
		const response = await fetchJson(
			`${baseUrl}/payment-gateway/config`,
			euerwerkRequest(apiKey, 'GET')
		);
		return PaymentConfigSchema.parse(response);
	}
});
