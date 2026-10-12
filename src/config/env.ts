import { z } from 'zod';

export const EnvSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3100),
	PUBLIC_BASE_URL: z.url(),
	DATABASE_URL: z.string().min(1),
	ENCRYPTION_KEY: z.base64().refine((key) => Buffer.from(key, 'base64').length === 32, {
		message: 'ENCRYPTION_KEY muss 32 Byte (base64) lang sein'
	}),
	ADMIN_API_KEY: z.string().min(32),
	PAYPAL_API_BASE: z.url().default('https://api-m.sandbox.paypal.com'),
	EUERWERK_API_BASE: z.url()
});

export type Env = z.infer<typeof EnvSchema>;

/** Validiert die Umgebung beim Start – fehlerhafte Konfiguration bricht sofort ab. */
export const loadEnv = (source: Record<string, string | undefined>): Env => EnvSchema.parse(source);
