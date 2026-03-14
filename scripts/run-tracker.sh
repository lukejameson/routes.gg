#!/bin/sh
set -e

# If routes table is empty, scrape timetables and import first
ROUTE_COUNT=$(node -e "
import('pg').then(({ default: pg }) => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT COUNT(*) FROM routes').then(r => {
    console.log(r.rows[0].count);
    pool.end();
  }).catch(() => { console.log('0'); pool.end(); });
});
" 2>/dev/null || echo "0")

if [ "$ROUTE_COUNT" = "0" ]; then
  echo "No routes found — running scraper..."
  npm run scrape
fi

exec npm run tracker
