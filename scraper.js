import https from 'https';
import { promises as fs } from 'fs';

const AGENCY = 'TCKTLSS_OP_GUERNSEY';
const API_BASE = 'ticketless-app.api.urbanthings.cloud';
const API_HEADERS = {
    'x-ut-app': 'travel.ticketless.app.guernsey;platform=web',
    'x-api-key': 'TIzVfvPTlb5bjo69rsOPbabDVhwwgSiLaV5MCiME',
    'Accept': 'application/vnd.ticketless.arrivalsList+json; version=3',
    'Referer': 'https:'
};

const DIRECTIONS = ['Outbound', 'Inbound'];

function get(path) {
    return new Promise((resolve, reject) => {
        const req = https.get(
            { hostname: API_BASE, path: '/api/2/' + path, headers: API_HEADERS },
            res => {
                let body = '';
                res.on('data', d => body += d);
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode} for ${path}`));
                        return;
                    }
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error(`JSON parse error for ${path}: ${e.message}`)); }
                });
            }
        );
        req.on('error', reject);
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function formatTime(isoString) {
    const d = new Date(isoString);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function todayDateParam() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchRoutes() {
    const data = await get(`routes?agencyId=${AGENCY}`);
    return data.items.map(r => ({
        routeId: r.routeID,
        lineName: r.lineName,
        description: r.routeDescription,
        color: r.lineColor,
        centrePointLat: r.centrePointLat?.parsedValue,
        centrePointLng: r.centrePointLng?.parsedValue,
    }));
}

async function fetchCalendars(routeId, direction) {
    const date = todayDateParam();
    const data = await get(`calendars?routeId=${routeId}&direction=${direction}&date=${date}`);
    return data.calendars || [];
}

function normaliseCalendar(cal, direction) {
    const stopMap = Object.fromEntries(cal.stops.map(s => [s.stopId, s.name]));
    const stopLocationMap = Object.fromEntries(cal.stops.map(s => [s.stopId, s.location]));
    const serviceDays = {
        monday: cal.runsMonday,
        tuesday: cal.runsTuesday,
        wednesday: cal.runsWednesday,
        thursday: cal.runsThursday,
        friday: cal.runsFriday,
        saturday: cal.runsSaturday,
        sunday: cal.runsSunday,
    };
    const trips = cal.trips.map(trip => ({
        headsign: trip.headsign,
        stopTimes: trip.stopCalls.map(sc => ({
            stopId: sc.stopId,
            stopName: stopMap[sc.stopId] || sc.stopId,
            arrival: formatTime(sc.arrivalTime),
            departure: formatTime(sc.departureTime),
        })),
    }));
    return {
        direction,
        validFrom: cal.applicableFrom.slice(0, 10),
        validTo: cal.applicableTo.slice(0, 10),
        serviceDays,
        additionalDates: cal.additionalRunningDates.map(d => d.slice(0, 10)),
        excludedDates: cal.excludedRunningDates.map(d => d.slice(0, 10)),
        stops: cal.stops.map(s => ({
            id: s.stopId,
            name: s.name,
            lat: s.location?.latitude,
            lng: s.location?.longitude
        })),
        trips,
    };
}

async function scrapeRoute(route) {
    const calendars = [];
    for (const direction of DIRECTIONS) {
        try {
            const raw = await fetchCalendars(route.routeId, direction);
            for (const cal of raw) {
                calendars.push(normaliseCalendar(cal, direction));
            }
        } catch (err) {
            console.warn(`  Warning: ${direction} failed for ${route.lineName}: ${err.message}`);
        }
        await sleep(200);
    }
    return {
        routeId: route.routeId,
        lineName: route.lineName,
        description: route.description,
        color: route.color,
        centrePointLat: route.centrePointLat,
        centrePointLng: route.centrePointLng,
        scrapedAt: new Date().toISOString(),
        calendars,
    };
}

async function scrape(options = {}) {
    const { outputFile = 'timetables.json', routes: routeFilter = null, verbose = true } = options;
    if (verbose) console.log('Fetching route list...');
    const allRoutes = await fetchRoutes();
    const routes = routeFilter
        ? allRoutes.filter(r => routeFilter.includes(r.lineName))
        : allRoutes;
    if (verbose) console.log(`Scraping ${routes.length} routes...\n`);
    const results = [];
    for (const route of routes) {
        if (verbose) process.stdout.write(`  Route ${route.lineName.padEnd(5)} ${route.description}...`);
        try {
            const data = await scrapeRoute(route);
            const tripCount = data.calendars.reduce((n, c) => n + c.trips.length, 0);
            results.push(data);
            if (verbose) console.log(` ${data.calendars.length} calendars, ${tripCount} trips`);
        } catch (err) {
            if (verbose) console.log(` ERROR: ${err.message}`);
            results.push({ ...route, error: err.message, calendars: [] });
        }
        await sleep(300);
    }
    const output = {
        scrapedAt: new Date().toISOString(),
        agency: AGENCY,
        totalRoutes: results.length,
        routes: results,
    };
    await fs.writeFile(outputFile, JSON.stringify(output, null, 2));
    if (verbose) console.log(`\nSaved to ${outputFile}`);
    return output;
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    const args = process.argv.slice(2);
    const routeFilter = args.length ? args : null;
    scrape({ routes: routeFilter }).catch(err => {
        console.error('Fatal:', err.message);
        process.exit(1);
    });
}

export { scrape, fetchRoutes, fetchCalendars };