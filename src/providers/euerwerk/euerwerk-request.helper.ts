import type { FetchJsonOptions } from '../../shared/http/fetch-json.helper.ts';

/** EÜRwerk: 401/403 = API-Key ungültig, widerrufen oder Konto gesperrt. */
const EUERWERK_ERROR_CODES: FetchJsonOptions['errorCodes'] = {
	401: 'UNAUTHORIZED',
	403: 'UNAUTHORIZED'
};

/** Request-Optionen mit dem API-Key des Mandanten. */
export const euerwerkRequest = (
	apiKey: string,
	method: 'GET' | 'POST',
	body?: unknown
): FetchJsonOptions => ({
	method,
	headers: { Authorization: `Bearer ${apiKey}` },
	errorCodes: EUERWERK_ERROR_CODES,
	...(body === undefined ? {} : { body })
});
