export type LogContext = Record<string, unknown>;

export interface Logger {
	info: (message: string, context?: LogContext) => void;
	warn: (message: string, context?: LogContext) => void;
	error: (message: string, context?: LogContext) => void;
}

type Level = keyof Logger;

const write = (level: Level, message: string, context: LogContext = {}): void => {
	const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...context });
	// eslint-disable-next-line no-console -- zentraler Log-Sink
	console[level](line);
};

/** Strukturierter JSON-Logger (eine Zeile pro Eintrag). */
export const createJsonLogger = (): Logger => ({
	info: (message, context) => {
		write('info', message, context);
	},
	warn: (message, context) => {
		write('warn', message, context);
	},
	error: (message, context) => {
		write('error', message, context);
	}
});

export const silentLogger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined
};
