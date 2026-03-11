/**
 * Elevation Grid — pre-computes terrain elevation for the entire drone search area.
 *
 * Uses Open-Meteo Elevation API (Copernicus DEM GLO-90, 90m resolution).
 * Generates a regular lat/lon grid covering the circular area, fetches elevations
 * in batches of 100, then provides O(1) bilinear interpolation for any point.
 *
 * Progressive loading: grid becomes available after first batch, updates as more load.
 * Re-fetches only when the user moves >30% of the radius or radius changes >50%.
 */

// ─── Grid Data Structure ──────────────────────────────────

interface GridMeta {
  centerLat: number;
  centerLon: number;
  radius: number;       // meters
  spacing: number;       // meters
  latMin: number;
  lonMin: number;
  dLat: number;          // degrees per row step
  dLon: number;          // degrees per col step
  rows: number;
  cols: number;
}

interface ElevationGridData {
  meta: GridMeta;
  data: Float32Array;    // row-major, rows * cols
  ready: boolean;
}

let _grid: ElevationGridData | null = null;
let _fetchPromise: Promise<void> | null = null;
let _listeners: Array<() => void> = [];

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/elevation';
const BATCH_SIZE = 100;  // Open-Meteo limit: max 100 coordinates per request
const NAN_ELEV = -9999;

// ─── Public API ───────────────────────────────────────────

/** Subscribe to grid updates. Returns unsubscribe function. */
export function onGridReady(cb: () => void): () => void {
  _listeners.push(cb);
  return () => { _listeners = _listeners.filter(l => l !== cb); };
}

function _notify() {
  for (const cb of _listeners) cb();
}

/** Get interpolated elevation for a point. Returns null if grid not ready or point outside. */
export function getElevation(lat: number, lon: number): number | null {
  if (!_grid?.ready) return null;
  const { meta, data } = _grid;

  // Fractional grid indices
  const row = (lat - meta.latMin) / meta.dLat;
  const col = (lon - meta.lonMin) / meta.dLon;

  // Bounds check
  if (row < 0 || col < 0 || row >= meta.rows - 1 || col >= meta.cols - 1) return null;

  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const r1 = Math.min(r0 + 1, meta.rows - 1);
  const c1 = Math.min(c0 + 1, meta.cols - 1);

  const fx = col - c0;
  const fy = row - r0;

  const q00 = data[r0 * meta.cols + c0];
  const q10 = data[r0 * meta.cols + c1];
  const q01 = data[r1 * meta.cols + c0];
  const q11 = data[r1 * meta.cols + c1];

  // Skip if any corner is missing
  if (q00 === NAN_ELEV || q10 === NAN_ELEV || q01 === NAN_ELEV || q11 === NAN_ELEV) return null;

  // Bilinear interpolation
  return q00 * (1 - fx) * (1 - fy)
       + q10 * fx * (1 - fy)
       + q01 * (1 - fx) * fy
       + q11 * fx * fy;
}

/** Check if grid is loaded and ready. */
export function isGridReady(): boolean {
  return _grid?.ready === true;
}

/** Check if grid is currently loading. */
export function isGridLoading(): boolean {
  return _fetchPromise !== null;
}

/** Get grid stats for debug display. */
export function getGridStats(): { points: number; spacing: number; ready: boolean } | null {
  if (!_grid) return null;
  return {
    points: _grid.meta.rows * _grid.meta.cols,
    spacing: _grid.meta.spacing,
    ready: _grid.ready,
  };
}

/**
 * Build elevation grid for a circular area.
 * Only re-fetches if center moved >30% of radius or radius changed >50%.
 */
export function buildGrid(centerLat: number, centerLon: number, radius: number): void {
  // Skip if radius is 0 (no filter mode)
  if (radius <= 0) return;

  // Check if current grid already covers this area
  if (_grid?.ready) {
    const dist = _haversine(centerLat, centerLon, _grid.meta.centerLat, _grid.meta.centerLon);
    const radiusRatio = Math.abs(radius - _grid.meta.radius) / _grid.meta.radius;
    if (dist < radius * 0.3 && radiusRatio < 0.5) {
      return; // Grid still valid
    }
  }

  // Don't start a new fetch if one is already in progress
  if (_fetchPromise) return;

  _fetchGrid(centerLat, centerLon, radius);
}

// ─── Internal ─────────────────────────────────────────────

function _computeSpacing(radius: number): number {
  // Target ~600 points in circle: π*(r/s)² = 600 → s = r/√(600/π) ≈ r/14
  // Open-Meteo free tier: max 100 coords/request
  // 600 pts → 6 batches, 500ms delay → ~3 sec total
  // Bilinear interpolation compensates for coarser grid
  // Clamp between 500m and 15000m
  return Math.max(500, Math.min(15000, radius / 14));
}

function _generateGridPoints(
  centerLat: number, centerLon: number, radius: number, spacing: number,
): { meta: GridMeta; lats: number[]; lons: number[]; indices: number[] } {
  const dLat = spacing / 111320;
  const dLon = spacing / (111320 * Math.cos(centerLat * Math.PI / 180));

  const latOffset = radius / 111320;
  const lonOffset = radius / (111320 * Math.cos(centerLat * Math.PI / 180));

  const latMin = centerLat - latOffset;
  const latMax = centerLat + latOffset;
  const lonMin = centerLon - lonOffset;
  const lonMax = centerLon + lonOffset;

  const rows = Math.ceil((latMax - latMin) / dLat) + 1;
  const cols = Math.ceil((lonMax - lonMin) / dLon) + 1;

  // Generate all grid points that fall within the circle
  const lats: number[] = [];
  const lons: number[] = [];
  const indices: number[] = []; // flat index in row-major grid

  const radiusSq = radius * radius;

  for (let r = 0; r < rows; r++) {
    const lat = latMin + r * dLat;
    for (let c = 0; c < cols; c++) {
      const lon = lonMin + c * dLon;
      // Quick approximate distance check (avoids trig for obvious out-of-range)
      const dlat = (lat - centerLat) * 111320;
      const dlon = (lon - centerLon) * 111320 * Math.cos(centerLat * Math.PI / 180);
      if (dlat * dlat + dlon * dlon <= radiusSq * 1.05) {
        lats.push(lat);
        lons.push(lon);
        indices.push(r * cols + c);
      }
    }
  }

  return {
    meta: { centerLat, centerLon, radius, spacing, latMin, lonMin, dLat, dLon, rows, cols },
    lats, lons, indices,
  };
}

async function _fetchBatch(
  url: string, data: Float32Array, indices: number[],
  start: number, totalPoints: number,
): Promise<number> {
  let loaded = 0;
  const res = await fetch(url);
  if (!res.ok) throw res;
  const json = await res.json();
  const elevations: number[] = Array.isArray(json.elevation) ? json.elevation : [json.elevation];
  for (let i = 0; i < elevations.length && (start + i) < totalPoints; i++) {
    if (elevations[i] != null) {
      data[indices[start + i]] = elevations[i];
      loaded++;
    }
  }
  return loaded;
}

async function _fetchGrid(centerLat: number, centerLon: number, radius: number): Promise<void> {
  const spacing = _computeSpacing(radius);
  const { meta, lats, lons, indices } = _generateGridPoints(centerLat, centerLon, radius, spacing);

  // Initialize grid with NaN
  const data = new Float32Array(meta.rows * meta.cols).fill(NAN_ELEV);
  _grid = { meta, data, ready: false };

  const totalPoints = lats.length;
  const batches = Math.ceil(totalPoints / BATCH_SIZE);

  console.log(
    `[ElevationGrid] Building grid: ${meta.rows}x${meta.cols} = ${meta.rows * meta.cols} cells, ` +
    `${totalPoints} points in circle, ${batches} API batches, spacing=${spacing.toFixed(0)}m`,
  );

  _fetchPromise = (async () => {
    try {
      let loaded = 0;
      let consecutiveFailures = 0;

      for (let b = 0; b < batches; b++) {
        const start = b * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, totalPoints);
        const batchLats = lats.slice(start, end).map(v => v.toFixed(4)).join(',');
        const batchLons = lons.slice(start, end).map(v => v.toFixed(4)).join(',');
        const url = `${OPEN_METEO_URL}?latitude=${batchLats}&longitude=${batchLons}`;

        try {
          const count = await _fetchBatch(url, data, indices, start, totalPoints);
          loaded += count;
          consecutiveFailures = 0;
        } catch (err: unknown) {
          if (err instanceof Response && err.status === 429) {
            // Exponential backoff: 3s → 6s → give up
            for (let retry = 0; retry < 2; retry++) {
              const wait = (retry + 1) * 3000;
              console.log(`[ElevationGrid] Rate limited, waiting ${wait}ms (retry ${retry + 1}/2)`);
              await new Promise(r => setTimeout(r, wait));
              try {
                const count = await _fetchBatch(url, data, indices, start, totalPoints);
                loaded += count;
                consecutiveFailures = 0;
                break;
              } catch {
                // Continue to next retry or give up
              }
            }
            consecutiveFailures++;
          } else {
            consecutiveFailures++;
          }

          // If 3+ consecutive failures, abort remaining batches
          if (consecutiveFailures >= 3) {
            console.warn(`[ElevationGrid] 3 consecutive failures, stopping at batch ${b + 1}/${batches}`);
            break;
          }
        }

        // Progressive: mark grid ready after first successful batch
        if (loaded > 0 && !_grid.ready) {
          _grid = { meta, data, ready: true };
          _notify();
        }

        // Delay between batches (500ms to stay well within rate limits)
        if (b < batches - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Final notify with all data loaded
      _grid = { meta, data, ready: true };
      console.log(`[ElevationGrid] Grid ready: ${loaded}/${totalPoints} elevations loaded`);
      _notify();
    } finally {
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}

function _haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
