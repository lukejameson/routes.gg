import { pool, initDb } from './db.js';
import type { ApiVehiclePositionsResponse, ApiVehiclePosition } from './types.js';
import 'dotenv/config';

const API_BASE = 'https://ticketless-app.api.urbanthings.cloud';
const API_PATH = '/api/2/vehiclepositions?maxLatitude=90&maxLongitude=180&minLatitude=-90&minLongitude=-180';
const API_HEADERS = {
  'x-ut-app': 'travel.ticketless.app.guernsey;platform=web',
  'x-api-key': 'TIzVfvPTlb5bjo69rsOPbabDVhwwgSiLaV5MCiME',
  'Accept': 'application/vnd.ticketless.arrivalsList+json; version=3',
  'Referer': 'https://buses.gg/',
};

const POLL_INTERVAL_MS    = parseInt(process.env.POLL_INTERVAL_MS ?? '30000', 10);
const OPERATING_START     = process.env.OPERATING_START ?? '05:30';
const OPERATING_END       = process.env.OPERATING_END   ?? '23:30';

function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function guernseyMinutes(): number {
  const t = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Guernsey', hour12: false });
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isOperatingHours(): boolean {
  const now = guernseyMinutes();
  return now >= parseHHMM(OPERATING_START) && now < parseHHMM(OPERATING_END);
}

function msUntilOperatingStart(): number {
  const now   = guernseyMinutes();
  const start = parseHHMM(OPERATING_START);
  const mins  = now < start ? start - now : (24 * 60 - now) + start;
  return mins * 60 * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// In-memory caches (tiny — ~61 routes, ~728 stops)
const routeCache = new Map<string, number>();                      // line_name_norm → route_id
const stopCache  = new Map<string, number>();                      // stop_ref → stop_id
const tripCache  = new Map<string, number>();                      // "routeId:direction:HH:MM" → trip_id
const stopLocations: Array<{ id: number; lat: number; lng: number }> = [];

async function buildCaches(): Promise<void> {
  const { rows: routes } = await pool.query<{ id: number; line_name_norm: string }>(
    'SELECT id, line_name_norm FROM routes'
  );
  for (const r of routes) routeCache.set(r.line_name_norm, r.id);

  const { rows: stops } = await pool.query<{ id: number; stop_ref: string; lat: number; lng: number }>(
    'SELECT id, stop_ref, lat, lng FROM stops'
  );
  stopLocations.length = 0;
  for (const s of stops) {
    stopCache.set(s.stop_ref, s.id);
    stopLocations.push({ id: s.id, lat: s.lat, lng: s.lng });
  }

  console.log(`Caches built: ${routeCache.size} routes, ${stopCache.size} stops`);
}

// Returns the nearest stop id within maxMetres, or null. Uses fast bounding-box
// pre-filter then Haversine for accuracy. 728 stops — negligible CPU per call.
function nearestStop(lat: number, lng: number, maxMetres: number): number | null {
  // ~0.005 deg lat ≈ 556m, scale lng by cos(lat) for rough isotropy
  const dLat = maxMetres / 111_320;
  const dLng = maxMetres / (111_320 * Math.cos(lat * Math.PI / 180));
  let best: number | null = null;
  let bestDist = maxMetres;
  for (const s of stopLocations) {
    if (Math.abs(s.lat - lat) > dLat || Math.abs(s.lng - lng) > dLng) continue;
    const dlatR = (s.lat - lat) * Math.PI / 180;
    const dlngR = (s.lng - lng) * Math.PI / 180;
    const a = Math.sin(dlatR / 2) ** 2 +
              Math.cos(lat * Math.PI / 180) * Math.cos(s.lat * Math.PI / 180) *
              Math.sin(dlngR / 2) ** 2;
    const dist = 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < bestDist) { bestDist = dist; best = s.id; }
  }
  return best;
}

function normRouteName(name: string): string {
  return name.toUpperCase().replace(/\s+/g, '');
}

function toGuernseyHHMM(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Guernsey',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

async function lookupTrip(routeId: number, direction: string, hhMM: string): Promise<number | null> {
  const key = `${routeId}:${direction}:${hhMM}`;
  if (tripCache.has(key)) return tripCache.get(key)!;

  // direction from API is lowercase "inbound"/"outbound"; DB stores capitalised "Inbound"/"Outbound"
  const dbDirection = direction.charAt(0).toUpperCase() + direction.slice(1).toLowerCase();

  const { rows } = await pool.query<{ id: number }>(
    `SELECT t.id FROM trips t
     JOIN calendars c ON c.id = t.calendar_id
     WHERE c.route_id = $1
       AND c.direction = $2
       AND t.first_departure = $3::time
     LIMIT 1`,
    [routeId, dbDirection, hhMM]
  );
  if (!rows.length) return null;
  tripCache.set(key, rows[0].id);
  return rows[0].id;
}

async function pollOnce(): Promise<void> {
  const t0 = Date.now();
  let data: ApiVehiclePositionsResponse;
  try {
    const res = await fetch(`${API_BASE}${API_PATH}`, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json() as ApiVehiclePositionsResponse;
  } catch (err: unknown) {
    console.error(`Poll fetch error: ${(err as Error).message}`);
    return;
  }

  const vehicles = data.items ?? [];
  if (!vehicles.length) {
    console.log('Poll: 0 vehicles');
    return;
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let pi = 1;

  // Build resolved entries with trip IDs
  const entries: Array<{
    v: ApiVehiclePosition;
    routeId: number | null;
    tripId: number | null;
    nextStopId: number | null;
    currentStopId: number | null;
  }> = [];

  for (const v of vehicles) {
    const norm = v.routeName ? normRouteName(v.routeName) : null;
    const routeId = norm ? (routeCache.get(norm) ?? null) : null;
    const { latitude: lat, longitude: lng } = v.position;

    // API-provided stop IDs, falling back to GPS inference if absent
    const nextStopId =
      v.nextStopId
        ? (stopCache.get(v.nextStopId) ?? null)
        : nearestStop(lat, lng, 150);

    const currentStopId =
      v.currentStopId
        ? (stopCache.get(v.currentStopId) ?? null)
        : nearestStop(lat, lng, 40);

    entries.push({ v, routeId, tripId: null, nextStopId, currentStopId });
  }

  // Resolve trip IDs (may hit DB for new combos)
  await Promise.all(
    entries.map(async entry => {
      const { v, routeId } = entry;
      if (routeId && v.direction && v.scheduledTripStartTime) {
        const hhMM = toGuernseyHHMM(v.scheduledTripStartTime);
        entry.tripId = await lookupTrip(routeId, v.direction, hhMM);
      }
    })
  );

  // Build batch INSERT
  for (const { v, routeId, tripId, nextStopId, currentStopId } of entries) {
    const dir = v.direction === 'inbound' ? 0 : v.direction === 'outbound' ? 1 : null;
    const occ = v.occupancy?.currentOccupancy ?? null;
    const bearing = v.position.bearing != null ? v.position.bearing : null;

    values.push(
      v.vehicleRef,
      routeId, tripId,
      v.position.latitude, v.position.longitude,
      bearing, nextStopId, occ, dir,
      v.reported,
      v.routeName ?? null,
      v.routeId ?? null,
      v.tripId ?? null,
      v.destination ?? null,
      currentStopId,
      v.vehicleId ?? null
    );
    placeholders.push(
      `($${pi},$${pi+1},$${pi+2},$${pi+3},$${pi+4},$${pi+5},$${pi+6},$${pi+7},$${pi+8},$${pi+9},$${pi+10},$${pi+11},$${pi+12},$${pi+13},$${pi+14},$${pi+15})`
    );
    pi += 16;
  }

  const sql = `
    INSERT INTO vehicle_positions
      (vehicle_ref, route_id, trip_id, lat, lng, bearing, next_stop_id, occupancy, direction, reported,
       raw_route_name, api_route_id, api_trip_id, destination, current_stop_id, vehicle_id)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (vehicle_ref, reported) DO NOTHING`;

  const res2 = await pool.query(sql, values);
  const inserted = res2.rowCount ?? 0;
  const dups = vehicles.length - inserted;
  const unmatched = entries.filter(e => e.routeId == null).length;
  const elapsed = Date.now() - t0;
  console.log(`Poll: +${inserted} new, ${dups} dup, ${unmatched} unmatched (${elapsed}ms)`);
}

async function run(): Promise<void> {
  await initDb();
  await buildCaches();
  console.log(`Polling every ${POLL_INTERVAL_MS / 1000}s (operating hours: ${OPERATING_START}–${OPERATING_END} Guernsey)`);

  while (true) {
    if (!isOperatingHours()) {
      const ms   = msUntilOperatingStart();
      const mins = Math.round(ms / 60_000);
      console.log(`Outside operating hours — sleeping ${mins} min until ${OPERATING_START}`);
      await sleep(ms);
      console.log('Resuming polling...');
      continue;
    }
    await pollOnce();
    await sleep(POLL_INTERVAL_MS);
  }
}

run().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
