import type { SessionData } from './session.svelte';

const DB = 'focull';
const STORE = 'session';
const KEY = 'session';

function withStore<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open(DB, 1);
		open.onupgradeneeded = () => open.result.createObjectStore(STORE);
		open.onerror = () => reject(open.error);
		open.onsuccess = () => {
			const db = open.result;
			const req = fn(db.transaction(STORE, mode).objectStore(STORE));
			req.onsuccess = () => {
				resolve(req.result);
				db.close();
			};
			req.onerror = () => {
				reject(req.error);
				db.close();
			};
		};
	});
}

export const saveSession = (data: SessionData): Promise<void> =>
	withStore('readwrite', (s) => s.put(data, KEY)).then(
		() => undefined,
		() => undefined // persistence is best-effort; never break the session over it
	);

export const loadSession = (): Promise<SessionData | undefined> =>
	withStore<SessionData | undefined>('readonly', (s) => s.get(KEY)).catch(() => undefined);

export const clearSession = (): Promise<void> =>
	withStore('readwrite', (s) => s.delete(KEY)).then(
		() => undefined,
		() => undefined
	);
