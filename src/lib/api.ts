import {
	AssetOrder,
	AssetVisibility,
	getAllTags,
	searchAssets,
	type AssetResponseDto,
	type MetadataSearchDto
} from '@immich/sdk';
import type { SessionSource, Settings } from './types';

export interface AuthUser {
	name: string;
	email: string;
}

export interface AuthStatus {
	configured: boolean;
	authenticated: boolean;
	envKey?: boolean;
	user?: AuthUser | null;
}

export const getAuthStatus = async (): Promise<AuthStatus> => {
	const res = await fetch('/api/auth');
	if (!res.ok) throw new Error(`auth check failed (${res.status})`);
	return (await res.json()) as AuthStatus;
};

export async function login(apiKey: string): Promise<AuthUser> {
	const res = await fetch('/api/auth', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ apiKey })
	});
	if (!res.ok) {
		let message = `Login failed (${res.status})`;
		try {
			const body = (await res.json()) as { message?: string };
			if (body.message) message = body.message;
		} catch {
			// keep the fallback message
		}
		throw new Error(message);
	}
	return ((await res.json()) as { user: AuthUser }).user;
}

export const logout = async (): Promise<void> => {
	await fetch('/api/auth', { method: 'DELETE' });
};

export const checkStitch = async (): Promise<boolean> => {
	try {
		const res = await fetch('/api/stitch');
		return res.ok && ((await res.json()) as { available: boolean }).available;
	} catch {
		return false;
	}
};

async function searchPaged(
	dto: MetadataSearchDto,
	onPage?: (items: AssetResponseDto[]) => void
): Promise<AssetResponseDto[]> {
	const all: AssetResponseDto[] = [];
	let page: number | null = 1;
	while (page !== null) {
		const result = await searchAssets({ metadataSearchDto: { ...dto, page } });
		all.push(...result.assets.items);
		onPage?.(result.assets.items);
		const next: string | null = result.assets.nextPage;
		page = next === null ? null : Number(next);
	}
	return all;
}

/**
 * IDs of every asset carrying one of the given tag paths. Immich search can filter
 * FOR a tag but not against one, so exclusion means collecting these up front.
 */
async function fetchTaggedAssetIds(tagPaths: string[]): Promise<Set<string>> {
	const tags = await getAllTags();
	const tagIds = tags.filter((t) => tagPaths.includes(t.value)).map((t) => t.id);
	if (tagIds.length === 0) return new Set();
	const tagged = await searchPaged({ tagIds, size: 1000, withExif: false });
	return new Set(tagged.map((a) => a.id));
}

/** Pull every asset matching the session source, then drop trashed / stacked / already-judged ones. */
export async function fetchSessionAssets(
	source: SessionSource,
	settings: Settings,
	onProgress?: (count: number) => void
): Promise<AssetResponseDto[]> {
	const base: MetadataSearchDto = {
		withExif: true,
		visibility: AssetVisibility.Timeline,
		withStacked: false,
		order: AssetOrder.Asc,
		size: 1000
	};
	if (source.kind === 'album') base.albumIds = [source.albumId];
	else if (source.kind !== 'unreviewed') {
		base.takenAfter = source.takenAfter;
		if (source.kind === 'range') base.takenBefore = source.takenBefore;
	}

	const judged = await fetchTaggedAssetIds([settings.reviewedTagName, settings.tagName]);
	let count = 0;
	const all = await searchPaged(base, (items) => onProgress?.((count += items.length)));
	return all.filter((a) => !a.isTrashed && !a.stack && !judged.has(a.id));
}
