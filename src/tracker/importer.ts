import { pool, initDb } from './db.js';
import type { TimetablesFile, TimetableStop } from './types.js';

async function importTimetablesData(data: TimetablesFile): Promise<void> {
  await initDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear stale timetable data; nullify vehicle_positions.trip_id first to avoid FK violations
    await client.query('UPDATE vehicle_positions SET trip_id = NULL WHERE trip_id IS NOT NULL');
    await client.query('DELETE FROM stop_times');
    await client.query('DELETE FROM trips');
    await client.query('DELETE FROM calendar_exceptions');
    await client.query('DELETE FROM calendars');

    // Pass 1: collect and upsert all stops across all routes/calendars
    const allStops = new Map<string, TimetableStop>();
    for (const route of data.routes) {
      if (route.error) continue;
      for (const cal of route.calendars) {
        for (const stop of cal.stops) {
          if (stop.id && stop.name && stop.lat != null && stop.lng != null) {
            allStops.set(stop.id, stop);
          }
        }
      }
    }

    const stopIdMap = new Map<string, number>(); // stop_ref → db id
    for (const stop of allStops.values()) {
      const res = await client.query<{ id: number }>(
        `INSERT INTO stops (stop_ref, name, lat, lng)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (stop_ref) DO UPDATE SET name=EXCLUDED.name, lat=EXCLUDED.lat, lng=EXCLUDED.lng
         RETURNING id`,
        [stop.id, stop.name, stop.lat, stop.lng]
      );
      stopIdMap.set(stop.id, res.rows[0].id);
    }

    // Pass 2: upsert routes, then insert calendars/trips/stop_times fresh
    for (const route of data.routes) {
      if (route.error || !route.lineName) continue;
      const lineNameNorm = route.lineName.toUpperCase().replace(/\s+/g, '');

      const routeRes = await client.query<{ id: number }>(
        `INSERT INTO routes (route_ref, line_name, line_name_norm, description, color)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (route_ref) DO UPDATE
           SET line_name=EXCLUDED.line_name,
               line_name_norm=EXCLUDED.line_name_norm,
               description=EXCLUDED.description,
               color=EXCLUDED.color
         RETURNING id`,
        [route.routeId, route.lineName, lineNameNorm, route.description ?? null, route.color ?? null]
      );
      const routeDbId = routeRes.rows[0].id;

      for (const cal of route.calendars) {
        const sd = cal.serviceDays;
        const calRes = await client.query<{ id: number }>(
          `INSERT INTO calendars
             (route_id, direction, valid_from, valid_to, mon, tue, wed, thu, fri, sat, sun)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`,
          [
            routeDbId, cal.direction, cal.validFrom, cal.validTo,
            sd.monday, sd.tuesday, sd.wednesday, sd.thursday,
            sd.friday, sd.saturday, sd.sunday,
          ]
        );
        const calDbId = calRes.rows[0].id;

        // Calendar exceptions
        for (const d of cal.additionalDates) {
          await client.query(
            `INSERT INTO calendar_exceptions (calendar_id, exception_date, exception_type)
             VALUES ($1,$2,'added') ON CONFLICT DO NOTHING`,
            [calDbId, d]
          );
        }
        for (const d of cal.excludedDates) {
          await client.query(
            `INSERT INTO calendar_exceptions (calendar_id, exception_date, exception_type)
             VALUES ($1,$2,'removed') ON CONFLICT DO NOTHING`,
            [calDbId, d]
          );
        }

        // Trips and stop_times
        for (const trip of cal.trips) {
          if (!trip.stopTimes.length) continue;
          const firstDep = trip.stopTimes[0].departure;

          const tripRes = await client.query<{ id: number }>(
            `INSERT INTO trips (calendar_id, headsign, first_departure)
             VALUES ($1,$2,$3) RETURNING id`,
            [calDbId, trip.headsign ?? null, firstDep]
          );
          const tripDbId = tripRes.rows[0].id;

          const stValues: unknown[] = [];
          const stPlaceholders: string[] = [];
          let pi = 1;
          let seq = 0;
          for (const st of trip.stopTimes) {
            const stopDbId = stopIdMap.get(st.stopId);
            if (!stopDbId) continue;
            stValues.push(tripDbId, stopDbId, seq, st.arrival, st.departure);
            stPlaceholders.push(`($${pi},$${pi+1},$${pi+2},$${pi+3},$${pi+4})`);
            pi += 5;
            seq++;
          }
          if (stPlaceholders.length) {
            await client.query(
              `INSERT INTO stop_times (trip_id, stop_id, seq, arrival, departure)
               VALUES ${stPlaceholders.join(',')}`,
              stValues
            );
          }
        }
      }
    }

    // Record scrape run
    await client.query(
      `INSERT INTO scrape_runs (scraped_at, total_routes, agency_id)
       VALUES ($1,$2,$3)`,
      [data.scrapedAt, data.totalRoutes, data.agency]
    );

    await client.query('COMMIT');
    console.log(`Imported ${data.totalRoutes} routes, ${allStops.size} stops`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Kept for standalone use: tsx src/tracker/importer.ts
async function importTimetables(filePath: string): Promise<void> {
  const { promises: fs } = await import('fs');
  const raw = await fs.readFile(filePath, 'utf8');
  const data: TimetablesFile = JSON.parse(raw);
  return importTimetablesData(data);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const TIMETABLES_PATH = process.env.TIMETABLES_PATH ?? './timetables.json';
  importTimetables(TIMETABLES_PATH).catch(err => {
    console.error('Import failed:', err instanceof Error ? err.stack : String(err));
    process.exit(1);
  }).finally(() => pool.end());
}

export { importTimetablesData, importTimetables };
