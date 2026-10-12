import { afterAll, afterEach, beforeAll } from 'vitest';
import { requestLog } from './request-log.ts';
import { mockServer } from './server.ts';

// onUnhandledFrame: 'error' → jeder nicht gemockte Netzwerkzugriff lässt den Test fehlschlagen.
beforeAll(() => {
	mockServer.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
	mockServer.resetHandlers();
	requestLog.clear();
});

afterAll(() => {
	mockServer.close();
});
