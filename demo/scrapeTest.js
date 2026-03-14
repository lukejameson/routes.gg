const puppeteer = require('puppeteer-core');
const fs = require('fs').promises;

const BASE_URL = 'https://buses.gg/timetables-child/';
const AGENCY = 'TCKTLSS_OP_GUERNSEY';
const TEST_ROUTE = `${AGENCY}-11-GE_11_11`;

async function interceptApiCall(page, routeId, direction = 'Outbound') {
    const url = `${BASE_URL}?routeId=${routeId}&initialDirection=${direction}`;
    const today = new Date();
    const dateParam = `${today.getFullYear()}-${today.getMonth() + 1}-${String(today.getDate()).padStart(2, '0')}`;

    return new Promise(async (resolve, reject) => {
        const responses = {};

        const handler = async resp => {
            const u = resp.url();
            if (u.includes('urbanthings') && u.includes('calendars') && !u.includes('OPTIONS')) {
                try { responses.calendars = await resp.json(); } catch {}
            }
            if (u.includes('urbanthings') && u.includes('routes') && !u.includes('OPTIONS')) {
                try { responses.routes = await resp.json(); } catch {}
            }
        };

        page.on('response', handler);

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(r => setTimeout(r, 4000));
        } finally {
            page.off('response', handler);
        }

        resolve(responses);
    });
}

function formatTime(isoString) {
    const d = new Date(isoString);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function describeDays(cal) {
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const keys = ['runsMonday','runsTuesday','runsWednesday','runsThursday','runsFriday','runsSaturday','runsSunday'];
    return days.filter((_, i) => cal[keys[i]]).join(', ') || 'No regular days';
}

async function main() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
    });

    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(30000);

        console.log(`Scraping route 11 (${TEST_ROUTE})...\n`);
        const data = await interceptApiCall(page, TEST_ROUTE, 'Outbound');

        if (!data.calendars) {
            console.log('ERROR: No calendar data received');
            return;
        }

        const cals = data.calendars.calendars;
        console.log(`Found ${cals.length} calendar(s)\n`);

        cals.forEach((cal, ci) => {
            const stopMap = Object.fromEntries(cal.stops.map(s => [s.stopId, s.name]));
            const days = describeDays(cal);
            const from = cal.applicableFrom.slice(0, 10);
            const to = cal.applicableTo.slice(0, 10);

            console.log(`Calendar ${ci + 1}: ${days}`);
            console.log(`  Valid: ${from} to ${to}`);
            console.log(`  ${cal.trips.length} trips, ${cal.stops.length} stops`);
            console.log(`  Stops: ${cal.stops.slice(0, 4).map(s => s.name).join(' → ')}...`);

            console.log(`  Departures from ${cal.stops[0]?.name}:`);
            cal.trips.slice(0, 6).forEach(trip => {
                const first = trip.stopCalls[0];
                const last = trip.stopCalls[trip.stopCalls.length - 1];
                const dep = formatTime(first.departureTime);
                const arr = formatTime(last.arrivalTime);
                const dest = stopMap[last.stopId] || last.stopId;
                console.log(`    ${dep} → ${arr} (${dest})`);
            });
            if (cal.trips.length > 6) console.log(`    ... and ${cal.trips.length - 6} more`);
            console.log();
        });

        await fs.writeFile('scrape_test_output.json', JSON.stringify(data.calendars, null, 2));
        console.log('Full data saved to scrape_test_output.json');

    } finally {
        await browser.close();
    }
}

main().catch(console.error);
