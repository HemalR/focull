import { AssetMediaSize, init } from '@immich/sdk';

/**
 * Point the SDK at the same-origin proxy. Authentication rides on the focull login
 * cookie — the proxy injects the real x-api-key server-side — so media URLs below
 * work directly in <img>/<video> tags.
 */
export const setupImmich = (): void => init({ baseUrl: '/api/immich', apiKey: '' });

export const thumbnailUrl = (id: string, size: AssetMediaSize = AssetMediaSize.Thumbnail): string =>
	`/api/immich/assets/${id}/thumbnail?size=${size}`;

export const previewUrl = (id: string): string => thumbnailUrl(id, AssetMediaSize.Preview);

export const playbackUrl = (id: string): string => `/api/immich/assets/${id}/video/playback`;
