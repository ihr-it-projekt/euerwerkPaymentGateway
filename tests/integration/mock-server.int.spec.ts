import { describe, expect, it } from 'vitest';

describe('Mockserver-Absicherung', () => {
	it('blockiert nicht gemockte Requests (kein echter Netzwerkzugriff in Tests)', async () => {
		const error = (await fetch('http://127.0.0.1:59999/not-mocked').catch(
			(e: unknown) => e
		)) as Error;

		expect(String(error.cause)).toContain('[MSW]');
	});
});
