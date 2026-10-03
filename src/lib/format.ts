/**
 * localDateTime is a timezone-agnostic timestamp serialized as UTC ISO — format it
 * in UTC so the photographer's wall-clock time is shown unshifted.
 */
const utc = (iso: string, opts: Intl.DateTimeFormatOptions): string =>
	new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(iso));

export const localTime = (iso: string): string =>
	utc(iso, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export const localDate = (iso: string): string =>
	utc(iso, { month: 'short', day: 'numeric', year: 'numeric' });

export const calendarDate = (iso: string): string =>
	new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** The SDK types duration as ms, but the Immich API has served "h:mm:ss.SSS" strings too. */
export const durationMs = (d: number | string | null | undefined): number => {
	if (typeof d === 'number') return d;
	if (!d) return 0;
	const [h = 0, m = 0, s = 0] = d.split(':').map(Number);
	return Math.round(((h * 60 + m) * 60 + s) * 1000);
};

export const fmtDuration = (d: number | string | null | undefined): string => {
	const total = Math.round(durationMs(d) / 1000);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const isoDaysAgo = (days: number): string =>
	new Date(Date.now() - days * 86_400_000).toISOString();

/** Coarse relative time for an epoch-ms instant in the past: "5 minutes ago", "yesterday". */
export function timeAgo(ms: number): string {
	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	const minutes = Math.round((ms - Date.now()) / 60_000);
	if (minutes === 0) return 'just now';
	if (minutes > -60) return rtf.format(minutes, 'minute');
	const hours = Math.round(minutes / 60);
	if (hours > -24) return rtf.format(hours, 'hour');
	return rtf.format(Math.round(hours / 24), 'day');
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
