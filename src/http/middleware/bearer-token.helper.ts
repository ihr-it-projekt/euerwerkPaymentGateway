/** `Authorization: Bearer <token>` → token (oder undefined). */
export const extractBearerToken = (header: string | undefined): string | undefined => {
	const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
	return match?.[1];
};
