import type { AircraftLookup } from './types/drone';

interface NfzFeature {
  name: string;
  type_code: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const lookupStore = new Map<string, CacheEntry<AircraftLookup>>();
const nfzStore = new Map<string, CacheEntry<NfzFeature[]>>();

export function getCachedLookup(droneKey: string): AircraftLookup | null {
  return lookupStore.get(droneKey)?.data ?? null;
}

export function setCachedLookup(droneKey: string, data: AircraftLookup): void {
  lookupStore.set(droneKey, { data, timestamp: Date.now() });
}

export function getCachedNfz(posKey: string): NfzFeature[] | null {
  const entry = nfzStore.get(posKey);
  return entry ? entry.data : null;
}

export function setCachedNfz(posKey: string, data: NfzFeature[]): void {
  nfzStore.set(posKey, { data, timestamp: Date.now() });
}

/**
 * Remove cache entries for drones that are no longer visible.
 * Call this from MapPage with the current set of drone basic_ids.
 */
export function pruneCache(visibleKeys: Set<string>): void {
  for (const key of lookupStore.keys()) {
    if (!visibleKeys.has(key)) {
      lookupStore.delete(key);
    }
  }
  // NFZ cache is keyed by position, keep it longer (positions don't change often)
  // Only prune if it gets too large
  if (nfzStore.size > 200) {
    const sorted = [...nfzStore.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (const [key] of sorted.slice(0, sorted.length - 100)) {
      nfzStore.delete(key);
    }
  }
}
