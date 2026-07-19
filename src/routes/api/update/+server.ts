import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const DEFAULT_REPO = 'hemalr/focull';
const CACHE_MS = 6 * 60 * 60 * 1000;

interface UpdateInfo {
	current: string;
	latest: string | null;
	updateAvailable: boolean;
	url: string | null;
}

let cache: { at: number; info: UpdateInfo } | null = null;

/**
 * Quiet update check against GitHub releases, cached 6h server-side.
 * Opt out entirely with FOCULL_DISABLE_UPDATE_CHECK=1.
 */
export const GET: RequestHandler = async () => {
	const current = __APP_VERSION__;
	if (env.FOCULL_DISABLE_UPDATE_CHECK === '1') {
		return json({ current, latest: null, updateAvailable: false, url: null } satisfies UpdateInfo);
	}
	if (cache && Date.now() - cache.at < CACHE_MS) return json(cache.info);

	const repo = env.FOCULL_UPDATE_REPO || DEFAULT_REPO;
	let info: UpdateInfo = { current, latest: null, updateAvailable: false, url: null };
	try {
		const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
			headers: { accept: 'application/vnd.github+json', 'user-agent': `focull/${current}` }
		});
		if (res.ok) {
			const release = (await res.json()) as { tag_name: string; html_url: string };
			const latest = release.tag_name.replace(/^v/, '');
			info = { current, latest, updateAvailable: isNewer(latest, current), url: release.html_url };
		}
	} catch {
		// offline or rate-limited — stay silent
	}
	cache = { at: Date.now(), info };
	return json(info);
};

function isNewer(latest: string, current: string): boolean {
	const l = latest.split('.').map(Number);
	const c = current.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if ((l[i] ?? 0) !== (c[i] ?? 0)) return (l[i] ?? 0) > (c[i] ?? 0);
	}
	return false;
}
