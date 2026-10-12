import { DomainError } from '../errors/domain-error.ts';

export interface FetchJsonOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	headers?: Record<string, string>;
	body?: unknown;
	formBody?: URLSearchParams;
}

const buildBody = (options: FetchJsonOptions): RequestInit['body'] =>
	options.formBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));

const buildHeaders = (options: FetchJsonOptions): Record<string, string> => ({
	Accept: 'application/json',
	...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
	...options.headers
});

/**
 * Dünner fetch-Wrapper für Upstream-REST-APIs.
 * Nicht-2xx-Antworten werden zu `DomainError('UPSTREAM_ERROR')`.
 */
export const fetchJson = async (url: string, options: FetchJsonOptions = {}): Promise<unknown> => {
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		headers: buildHeaders(options),
		body: buildBody(options)
	});
	const text = await response.text();
	if (!response.ok) {
		throw new DomainError('UPSTREAM_ERROR', `${response.status} von ${url}: ${text.slice(0, 500)}`);
	}
	return text === '' ? null : (JSON.parse(text) as unknown);
};
