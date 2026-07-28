export function bigintFromStableHash(key: string): bigint {
  let hash = 14695981039346656037n & 0x7fffffffffffffffn;
  for (let i = 0; i < key.length; i++) {
    hash ^= BigInt(key.charCodeAt(i));
    hash *= 1099511628211n;
    hash &= 0x7fffffffffffffffn;
  }
  return hash;
}

export interface LockAdapter {
  acquire<T>(key: string, fn: () => Promise<T>): Promise<T | "LOCKED">;
}

let adapter: LockAdapter | undefined;

export function setLockAdapter(a: LockAdapter): void {
  adapter = a;
}

export async function withJobLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T | "LOCKED"> {
  if (!adapter) throw new Error("Lock adapter not configured — call setLockAdapter() first");
  return adapter.acquire(key, fn);
}
