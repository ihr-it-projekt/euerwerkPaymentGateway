import { DomainError, type DomainErrorCode } from '../errors/domain-error.ts';

export interface FetchJsonOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	headers?: Record<string, string>;
	body?: unknown;
	formBody?: URLSearchParams;
	/** HTTP-Status → fachlicher Fehlercode (Default für alle anderen: `UPSTREAM_ERROR`). */
	errorCodes?: Partial<Record<number, DomainErrorCode>>;
}

const buildBody = (options: FetchJsonOptions): RequestInit['body'] =>
	options.formBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));

const buildHeaders = (options: FetchJsonOptions): Record<string, string> => ({
	Accept: 'application/json',
	...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
	...options.headers
});

const toError = (
	status: number,
	url: string,
	text: string,
	options: FetchJsonOptions
): DomainError =>
	new DomainError(
		options.errorCodes?.[status] ?? 'UPSTREAM_ERROR',
		`${status} von ${url}: ${text.slice(0, 500)}`
	);

/**
 * Dünner fetch-Wrapper für Upstream-REST-APIs.
 * Nicht-2xx-Antworten werden zu `DomainError` (Code laut `errorCodes`, sonst `UPSTREAM_ERROR`).
 */
export const fetchJson = async (url: string, options: FetchJsonOptions = {}): Promise<unknown> => {
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		headers: buildHeaders(options),
		body: buildBody(options)
	});
	const text = await response.text();
	if (!response.ok) {
		throw toError(response.status, url, text, options);
	}
	return text === '' ? null : (JSON.parse(text) as unknown);
};
