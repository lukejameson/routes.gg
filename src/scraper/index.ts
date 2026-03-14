import https from 'https';
import { importTimetablesData } from '../tracker/importer.js';
import { pool } from '../tracker/db.js';

const AGENCY = 'TCKTLSS_OP_GUERNSEY';
const API_BASE = 'ticketless-app.api.urbanthings.cloud';
const API_HEADERS: Record<string, string> = {
  'x-ut-app': 'travel.ticketless.app.guernsey;platform=web',
  'x-api-key': 'TIzVfvPTlb5bjo69rsOPbabDVhwwgSiLaV5MCiME',
  'Accept': 'application/vnd.ticketless.arrivalsList+json; version=3',
  'Referer': 'https:',
};

const DIRECTIONS = ['Outbound', 'Inbound'];

function get(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      { hostname: API_BASE, path: '/api/2/' + path, headers: API_HEADERS },
      res => {
        let body = '';
        res.on('data', (d: string) => body += d);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${path}`));
            return;
          }
          try { resolve(JSON.parse(body)); }
          catch (e: unknown) { reject(new Error(`JSON parse error: ${(e as Error).message}`)); }
        });
      }
    );
    req.on('error', reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function todayDateParam(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchRoutes() {
  const data = await get(`routes?agencyId=${AGENCY}`) as { items: Array<Record<string, unknown>> };
  return data.items.map(r => ({
    routeId: r['routeID'] as string,
    lineName: r['lineName'] as string,
    description: r['routeDescription'] as string,
    color: r['lineColor'] as string | undefined,
  }));
}

async function fetchCalendars(routeId: string, direction: string) {
  const date = todayDateParam();
  const data = await get(`calendars?routeId=${routeId}&direction=${direction}&date=${date}`) as { calendars?: unknown[] };
  return data.calendars ?? [];
}

function normaliseCalendar(cal: Record<string, unknown>, direction: string) {
  const stops = cal['stops'] as Array<Record<string, unknown>>;
  const stopMap = Object.fromEntries(stops.map(s => [s['stopId'], s['name']]));
  const serviceDays = {
    monday:    cal['runsMonday'] as boolean,
    tuesday:   cal['runsTuesday'] as boolean,
    wednesday: cal['runsWednesday'] as boolean,
    thursday:  cal['runsThursday'] as boolean,
    friday:    cal['runsFriday'] as boolean,
    saturday:  cal['runsSaturday'] as boolean,
    sunday:    cal['runsSunday'] as boolean,
  };
  const trips = (cal['trips'] as Array<Record<string, unknown>>).map(trip => ({
    headsign: trip['headsign'] as string | undefined,
    stopTimes: (trip['stopCalls'] as Array<Record<string, unknown>>).map(sc => ({
      stopId:   sc['stopId'] as string,
      stopName: (stopMap[sc['stopId'] as string] as string) || sc['stopId'] as string,
      arrival:  formatTime(sc['arrivalTime'] as string),
      departure: formatTime(sc['departureTime'] as string),
    })),
  }));
  return {
    direction,
    validFrom: (cal['applicableFrom'] as string).slice(0, 10),
    validTo:   (cal['applicableTo'] as string).slice(0, 10),
    serviceDays,
    additionalDates: (cal['additionalRunningDates'] as string[]).map(d => d.slice(0, 10)),
    excludedDates:   (cal['excludedRunningDates'] as string[]).map(d => d.slice(0, 10)),
    stops: stops.map(s => {
      const loc = s['location'] as Record<string, number> | undefined;
      return { id: s['stopId'] as string, name: s['name'] as string, lat: loc?.['latitude'], lng: loc?.['longitude'] };
    }),
    trips,
  };
}

async function scrapeRoute(route: { routeId: string; lineName: string; description: string; color?: string }) {
  const calendars: ReturnType<typeof normaliseCalendar>[] = [];
  for (const direction of DIRECTIONS) {
    try {
      const raw = await fetchCalendars(route.routeId, direction) as Array<Record<string, unknown>>;
      for (const cal of raw) {
        calendars.push(normaliseCalendar(cal, direction));
      }
    } catch (err: unknown) {
      console.warn(`  Warning: ${direction} failed for ${route.lineName}: ${(err as Error).message}`);
    }
    await sleep(200);
  }
  return {
    routeId: route.routeId,
    lineName: route.lineName,
    description: route.description,
    color: route.color,
    scrapedAt: new Date().toISOString(),
    calendars,
  };
}

async function scrape(options: { routes?: string[] | null; verbose?: boolean } = {}) {
  const { routes: routeFilter = null, verbose = true } = options;
  if (verbose) console.log('Fetching route list...');
  const allRoutes = await fetchRoutes();
  const routes = routeFilter
    ? allRoutes.filter(r => routeFilter.includes(r.lineName))
    : allRoutes;
  if (verbose) console.log(`Scraping ${routes.length} routes...\n`);
  const results: unknown[] = [];
  for (const route of routes) {
    if (verbose) process.stdout.write(`  Route ${route.lineName.padEnd(5)} ${route.description}...`);
    try {
      const data = await scrapeRoute(route);
      const tripCount = data.calendars.reduce((n, c) => n + c.trips.length, 0);
      results.push(data);
      if (verbose) console.log(` ${data.calendars.length} calendars, ${tripCount} trips`);
    } catch (err: unknown) {
      if (verbose) console.log(` ERROR: ${(err as Error).message}`);
      results.push({ ...route, error: (err as Error).message, calendars: [] });
    }
    await sleep(300);
  }
  const output = {
    scrapedAt: new Date().toISOString(),
    agency: AGENCY,
    totalRoutes: results.length,
    routes: results,
  };
  return output;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const routeFilter = args.length ? args : null;
  scrape({ routes: routeFilter })
    .then(data => importTimetablesData(data as Parameters<typeof importTimetablesData>[0]))
    .catch(err => {
      console.error('Fatal:', (err as Error).message);
      process.exit(1);
    })
    .finally(() => pool.end());
}

export { scrape };
