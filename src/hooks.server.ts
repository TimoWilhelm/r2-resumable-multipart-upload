import { dev } from '$app/environment';

export const handle = async ({ event, resolve }) => {
	if (dev) {
		const { mockPlatform } = await import('./miniflare');
		event.platform = await mockPlatform(event.platform);
	}

	return resolve(event);
};
