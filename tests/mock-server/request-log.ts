import type { HttpResponseResolver } from 'msw';

export interface RecordedRequest {
	method: string;
	url: URL;
	headers: Headers;
	body: unknown;
}

const entries: RecordedRequest[] = [];

const parseBody = (contentType: string, text: string): unknown => {
	if (text === '') {
		return null;
	}
	if (contentType.includes('application/json')) {
		return JSON.parse(text) as unknown;
	}
	if (contentType.includes('application/x-www-form-urlencoded')) {
		return Object.fromEntries(new URLSearchParams(text));
	}
	return text;
};

const record = async (request: Request): Promise<void> => {
	const text = await request.clone().text();
	entries.push({
		method: request.method,
		url: new URL(request.url),
		headers: request.headers,
		body: parseBody(request.headers.get('content-type') ?? '', text)
	});
};

/** Protokolliert alle vom Mockserver beantworteten Requests für Assertions. */
export const requestLog = {
	all: (): RecordedRequest[] => [...entries],
	find: (method: string, pathname: RegExp): RecordedRequest[] =>
		entries.filter((entry) => entry.method === method && pathname.test(entry.url.pathname)),
	clear: (): void => {
		entries.length = 0;
	}
};

/** Wrapper für MSW-Resolver, der jeden Request vor der Antwort protokolliert. */
export const recorded =
	(resolver: HttpResponseResolver): HttpResponseResolver =>
	async (info) => {
		await record(info.request);
		return resolver(info);
	};
