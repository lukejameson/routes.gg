const express = require('express');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 5173;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.use(express.static(path.join(__dirname, 'public')));

// Helper to convert string numbers to actual numbers
const convertNumeric = (rows, fields) => {
  return rows.map(row => {
    const newRow = { ...row };
    fields.forEach(field => {
      if (newRow[field] !== null && newRow[field] !== undefined) {
        const num = parseFloat(newRow[field]);
        newRow[field] = isNaN(num) ? newRow[field] : num;
      }
    });
    return newRow;
  });
};

// Helper to build date/time filter conditions
const buildDateFilter = (params) => {
  const conditions = [];
  const values = [];
  let paramIndex = 1;

  // Date range filtering
  if (params.from) {
    conditions.push(`vp.reported >= $${paramIndex}`);
    values.push(params.from);
    paramIndex++;
  }
  if (params.to) {
    conditions.push(`vp.reported <= $${paramIndex}`);
    values.push(params.to);
    paramIndex++;
  }

  // Time of day filtering (ignores date, just looks at time component)
  if (params.timeFrom) {
    conditions.push(`(vp.reported AT TIME ZONE 'Europe/Guernsey')::time >= $${paramIndex}`);
    values.push(params.timeFrom);
    paramIndex++;
  }
  if (params.timeTo) {
    conditions.push(`(vp.reported AT TIME ZONE 'Europe/Guernsey')::time <= $${paramIndex}`);
    values.push(params.timeTo);
    paramIndex++;
  }

  // Day of week filtering
  if (params.days) {
    const days = params.days.split(',').map(d => parseInt(d)).filter(d => !isNaN(d));
    if (days.length > 0) {
      conditions.push(`EXTRACT(DOW FROM vp.reported) IN (${days.map((_, i) => `$${paramIndex + i}`).join(',')})`);
      values.push(...days);
      paramIndex += days.length;
    }
  }

  return { whereClause: conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '', values, paramIndex };
};

// Get preset date ranges
const getPresetDates = (preset) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last24h':
      start.setHours(start.getHours() - 24);
      break;
    case 'last7d':
      start.setDate(start.getDate() - 7);
      break;
    case 'thisWeek':
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      break;
    case 'lastWeek':
      start.setDate(start.getDate() - start.getDay() - 7);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - end.getDay() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'thisMonth':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      return null;
  }

  return { from: start.toISOString(), to: end.toISOString() };
};

app.get('/api/live-fleet', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        to_char(vp.reported AT TIME ZONE 'Europe/Guernsey', 'HH24:MI:SS') AS "Time",
        vp.vehicle_ref AS "Vehicle",
        r.line_name AS "Route",
        CASE vp.direction WHEN 0 THEN 'In' WHEN 1 THEN 'Out' ELSE '?' END AS "Dir",
        COALESCE(vp.destination, t.headsign, '—') AS "Destination",
        to_char(t.first_departure, 'HH24:MI') AS "Dep",
        COALESCE(cs.name, '—') AS "At Stop",
        COALESCE(ns.name, '—') AS "Next Stop",
        total_stops.n AS "Total",
        COALESCE(next_seq.seq, 0) AS "Done",
        total_stops.n - COALESCE(next_seq.seq, 0) AS "Left",
        ROUND(100.0 * COALESCE(next_seq.seq, 0) / NULLIF(total_stops.n, 0)) || '%' AS "Pct",
        vp.lat,
        vp.lng
      FROM vehicle_positions vp
      JOIN routes r ON r.id = vp.route_id
      JOIN trips t ON t.id = vp.trip_id
      LEFT JOIN stops cs ON cs.id = vp.current_stop_id
      LEFT JOIN stops ns ON ns.id = vp.next_stop_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS n FROM stop_times WHERE trip_id = t.id
      ) total_stops ON true
      LEFT JOIN LATERAL (
        SELECT seq FROM stop_times
        WHERE trip_id = t.id AND stop_id = vp.next_stop_id
        LIMIT 1
      ) next_seq ON true
      WHERE vp.ts = (
        SELECT MAX(ts2.ts) FROM vehicle_positions ts2
        WHERE ts2.vehicle_ref = vp.vehicle_ref
      )
      ORDER BY r.line_name, vp.vehicle_ref
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/punctuality', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);
    
    const [live, byRoute, byHour, summary] = await Promise.all([
      pool.query(`
        SELECT
          r.line_name AS "Route",
          vp.vehicle_ref AS "Vehicle",
          CASE vp.direction WHEN 0 THEN 'In' WHEN 1 THEN 'Out' END AS "Dir",
          to_char(t.first_departure, 'HH24:MI') AS "Sched Dep",
          to_char(sched_next.departure, 'HH24:MI') AS "Sched@Next",
          to_char((vp.reported AT TIME ZONE 'Europe/Guernsey')::time, 'HH24:MI') AS "Actual@Next",
          CASE
            WHEN sched_next.departure IS NULL THEN null
            WHEN (vp.reported AT TIME ZONE 'Europe/Guernsey')::time > sched_next.departure
              THEN EXTRACT(EPOCH FROM (
                (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
              ))::int / 60
            WHEN (vp.reported AT TIME ZONE 'Europe/Guernsey')::time < sched_next.departure
              THEN -EXTRACT(EPOCH FROM (
                sched_next.departure - (vp.reported AT TIME ZONE 'Europe/Guernsey')::time
              ))::int / 60
            ELSE 0
          END AS "VarianceMin",
          ns.name AS "Next Stop"
        FROM vehicle_positions vp
        JOIN routes r ON r.id = vp.route_id
        JOIN trips t ON t.id = vp.trip_id
        LEFT JOIN stops ns ON ns.id = vp.next_stop_id
        LEFT JOIN LATERAL (
          SELECT st.departure FROM stop_times st
          WHERE st.trip_id = t.id AND st.stop_id = vp.next_stop_id
          LIMIT 1
        ) sched_next ON true
        WHERE vp.ts = (
          SELECT MAX(ts2.ts) FROM vehicle_positions ts2
          WHERE ts2.vehicle_ref = vp.vehicle_ref
        ) AND vp.next_stop_id IS NOT NULL
        ORDER BY r.line_name
      `),
      pool.query(`
        SELECT
          r.line_name,
          ROUND(AVG(EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60)::numeric, 2) as avg_delay_min,
          COUNT(*) as sample_count,
          ROUND((COUNT(*) FILTER (WHERE ABS(EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60) <= 2)::numeric / COUNT(*)::numeric * 100), 1) as on_time_pct
        FROM vehicle_positions vp
        JOIN routes r ON r.id = vp.route_id
        JOIN trips t ON t.id = vp.trip_id
        JOIN stop_times st ON st.trip_id = t.id AND st.stop_id = vp.next_stop_id
        WHERE vp.next_stop_id IS NOT NULL
        ${filter.whereClause}
        GROUP BY r.line_name
        ORDER BY avg_delay_min DESC
      `, filter.values),
      pool.query(`
        SELECT
          EXTRACT(HOUR FROM vp.reported AT TIME ZONE 'Europe/Guernsey')::int as hour,
          ROUND(AVG(EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60)::numeric, 2) as avg_delay_min,
          COUNT(*) as sample_count
        FROM vehicle_positions vp
        JOIN trips t ON t.id = vp.trip_id
        JOIN stop_times st ON st.trip_id = t.id AND st.stop_id = vp.next_stop_id
        WHERE vp.next_stop_id IS NOT NULL
        ${filter.whereClause}
        GROUP BY hour
        ORDER BY hour
      `, filter.values),
      pool.query(`
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60)::numeric, 2) as overall_avg_delay,
          COUNT(*) as total_samples,
          ROUND((COUNT(*) FILTER (WHERE ABS(EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60) <= 2)::numeric / COUNT(*)::numeric * 100), 1) as overall_on_time_pct,
          ROUND((COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60 > 5)::numeric / COUNT(*)::numeric * 100), 1) as late_pct,
          ROUND((COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60 < -2)::numeric / COUNT(*)::numeric * 100), 1) as early_pct
        FROM vehicle_positions vp
        JOIN trips t ON t.id = vp.trip_id
        JOIN stop_times st ON st.trip_id = t.id AND st.stop_id = vp.next_stop_id
        WHERE vp.next_stop_id IS NOT NULL
        ${filter.whereClause}
      `, filter.values)
    ]);

    res.json({ 
      live: live.rows, 
      byRoute: convertNumeric(byRoute.rows, ['avg_delay_min', 'sample_count', 'on_time_pct']),
      byHour: convertNumeric(byHour.rows, ['avg_delay_min', 'sample_count']),
      summary: convertNumeric([summary.rows[0]], ['overall_avg_delay', 'total_samples', 'overall_on_time_pct', 'late_pct', 'early_pct'])[0],
      filters: { from: params.from, to: params.to, timeFrom: params.timeFrom, timeTo: params.timeTo, days: params.days }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/occupancy', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const [byRoute, summary] = await Promise.all([
      pool.query(`
        SELECT
          r.line_name AS "Route",
          COUNT(*) AS "Samples",
          ROUND((AVG(vp.occupancy) * 100)::numeric, 1) AS "Avg Occupancy %",
          ROUND((MAX(vp.occupancy) * 100)::numeric, 1) AS "Peak Occupancy %",
          COUNT(*) FILTER (WHERE vp.occupancy < 0.33) AS "Low",
          COUNT(*) FILTER (WHERE vp.occupancy BETWEEN 0.33 AND 0.66) AS "Medium",
          COUNT(*) FILTER (WHERE vp.occupancy > 0.66) AS "High"
        FROM vehicle_positions vp
        JOIN routes r ON r.id = vp.route_id
        WHERE vp.occupancy IS NOT NULL
        ${filter.whereClause}
        GROUP BY r.line_name
        ORDER BY "Avg Occupancy %" DESC
      `, filter.values),
      pool.query(`
        SELECT
          ROUND((AVG(occupancy) * 100)::numeric, 1) as overall_avg,
          ROUND((MAX(occupancy) * 100)::numeric, 1) as overall_peak,
          COUNT(*) FILTER (WHERE occupancy < 0.33) as low_count,
          COUNT(*) FILTER (WHERE occupancy BETWEEN 0.33 AND 0.66) as medium_count,
          COUNT(*) FILTER (WHERE occupancy > 0.66) as high_count,
          COUNT(*) as total_with_occupancy
        FROM vehicle_positions
        WHERE occupancy IS NOT NULL
        ${filter.whereClause.replace(/vp\./g, '')}
      `, filter.values)
    ]);

    res.json({
      byRoute: convertNumeric(byRoute.rows, ['Samples', 'Avg Occupancy %', 'Peak Occupancy %', 'Low', 'Medium', 'High']),
      summary: convertNumeric([summary.rows[0]], ['overall_avg', 'overall_peak', 'low_count', 'medium_count', 'high_count', 'total_with_occupancy'])[0],
      filters: { from: params.from, to: params.to, timeFrom: params.timeFrom, timeTo: params.timeTo }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/speeds', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const [speeds, stats] = await Promise.all([
      pool.query(`
        WITH speed_calc AS (
          SELECT
            vp.vehicle_ref,
            r.line_name,
            vp.reported,
            LAG(vp.reported) OVER w as prev_time,
            6371000 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians(vp.lat)) * cos(radians(LAG(vp.lat) OVER w)) *
                cos(radians(LAG(vp.lng) OVER w) - radians(vp.lng)) +
                sin(radians(vp.lat)) * sin(radians(LAG(vp.lat) OVER w))
              ))
            ) as distance_m
          FROM vehicle_positions vp
          JOIN routes r ON r.id = vp.route_id
          WHERE vp.lat IS NOT NULL AND vp.lng IS NOT NULL
          ${filter.whereClause}
          WINDOW w AS (PARTITION BY vp.vehicle_ref ORDER BY vp.reported)
        )
        SELECT
          line_name,
          vehicle_ref,
          reported,
          ROUND(distance_m::numeric, 1) as distance_m,
          ROUND((EXTRACT(EPOCH FROM (reported - prev_time)))::numeric, 1) as seconds,
          ROUND((distance_m / NULLIF(EXTRACT(EPOCH FROM (reported - prev_time)), 0) * 2.23694)::numeric, 1) as speed_mph
        FROM speed_calc
        WHERE prev_time IS NOT NULL
          AND EXTRACT(EPOCH FROM (reported - prev_time)) BETWEEN 20 AND 40
          AND (distance_m / NULLIF(EXTRACT(EPOCH FROM (reported - prev_time)), 0) * 2.23694) < 35
          AND distance_m > 10
        ORDER BY speed_mph DESC NULLS LAST
        LIMIT 100
      `, filter.values),
      pool.query(`
        WITH speed_calc AS (
          SELECT
            vp.vehicle_ref,
            r.line_name,
            6371000 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians(vp.lat)) * cos(radians(LAG(vp.lat) OVER w)) *
                cos(radians(LAG(vp.lng) OVER w) - radians(vp.lng)) +
                sin(radians(vp.lat)) * sin(radians(LAG(vp.lat) OVER w))
              ))
            ) as distance_m,
            EXTRACT(EPOCH FROM (vp.reported - LAG(vp.reported) OVER w)) as seconds
          FROM vehicle_positions vp
          JOIN routes r ON r.id = vp.route_id
          WHERE vp.lat IS NOT NULL AND vp.lng IS NOT NULL
          ${filter.whereClause}
          WINDOW w AS (PARTITION BY vp.vehicle_ref ORDER BY vp.reported)
        )
        SELECT
          ROUND(AVG(distance_m / NULLIF(seconds, 0) * 2.23694)::numeric, 1) as avg_speed,
          ROUND(MAX(distance_m / NULLIF(seconds, 0) * 2.23694)::numeric, 1) as max_speed,
          ROUND(MIN(distance_m / NULLIF(seconds, 0) * 2.23694)::numeric, 1) as min_speed,
          COUNT(*) as speed_samples
        FROM speed_calc
        WHERE seconds BETWEEN 20 AND 40
          AND (distance_m / NULLIF(seconds, 0) * 2.23694) < 35
          AND distance_m > 10
      `, filter.values)
    ]);

    res.json({
      speeds: convertNumeric(speeds.rows, ['distance_m', 'seconds', 'speed_mph']),
      stats: convertNumeric([stats.rows[0]], ['avg_speed', 'max_speed', 'min_speed', 'speed_samples'])[0],
      filters: { from: params.from, to: params.to }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stops', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const [busiest, popularity, dwellSummary] = await Promise.all([
      pool.query(`
        SELECT
          s.name as stop_name,
          EXTRACT(HOUR FROM vp.reported AT TIME ZONE 'Europe/Guernsey')::int as hour,
          COUNT(DISTINCT vp.vehicle_ref) as bus_count,
          COUNT(*) as position_samples,
          ROUND(AVG(vp.occupancy * 100)::numeric, 1) as avg_occupancy_pct
        FROM vehicle_positions vp
        JOIN stops s ON s.id = vp.next_stop_id
        WHERE vp.next_stop_id IS NOT NULL
        ${filter.whereClause}
        GROUP BY s.name, hour
        HAVING COUNT(DISTINCT vp.vehicle_ref) > 3
        ORDER BY bus_count DESC, hour
        LIMIT 50
      `, filter.values),
      pool.query(`
        SELECT
          s.name AS "Stop",
          COUNT(*) AS "Observations",
          COUNT(DISTINCT vp.vehicle_ref) AS "Distinct Vehicles",
          COUNT(DISTINCT r.id) AS "Distinct Routes",
          string_agg(DISTINCT r.line_name, ', ' ORDER BY r.line_name) AS "Routes"
        FROM vehicle_positions vp
        JOIN stops s ON s.id = vp.next_stop_id
        JOIN routes r ON r.id = vp.route_id
        WHERE vp.next_stop_id IS NOT NULL
        ${filter.whereClause}
        GROUP BY s.name
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `, filter.values),
      pool.query(`
        WITH stop_visits AS (
          SELECT
            vp.vehicle_ref,
            r.line_name,
            s.name as stop_name,
            vp.next_stop_id,
            vp.reported,
            LEAD(vp.next_stop_id) OVER (PARTITION BY vp.vehicle_ref ORDER BY vp.reported) as next_stop_next,
            LEAD(vp.reported) OVER (PARTITION BY vp.vehicle_ref ORDER BY vp.reported) as reported_next
          FROM vehicle_positions vp
          JOIN routes r ON r.id = vp.route_id
          JOIN stops s ON s.id = vp.next_stop_id
          WHERE vp.next_stop_id IS NOT NULL
          ${filter.whereClause}
        )
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (reported_next - reported)))::numeric, 1) as overall_avg_dwell,
          ROUND(MAX(EXTRACT(EPOCH FROM (reported_next - reported)))::numeric, 1) as max_dwell,
          COUNT(*) as dwell_samples
        FROM stop_visits
        WHERE next_stop_next != next_stop_id
          AND EXTRACT(EPOCH FROM (reported_next - reported)) < 600
      `, filter.values)
    ]);

    res.json({
      busiest: convertNumeric(busiest.rows, ['hour', 'bus_count', 'position_samples', 'avg_occupancy_pct']),
      popularity: convertNumeric(popularity.rows, ['Observations', 'Distinct Vehicles', 'Distinct Routes']),
      dwellSummary: convertNumeric([dwellSummary.rows[0]], ['overall_avg_dwell', 'max_dwell', 'dwell_samples'])[0],
      filters: { from: params.from, to: params.to }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dwell-times', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const result = await pool.query(`
      WITH stop_visits AS (
        SELECT
          vp.vehicle_ref,
          r.line_name,
          s.name as stop_name,
          vp.next_stop_id,
          vp.reported,
          LEAD(vp.next_stop_id) OVER (PARTITION BY vp.vehicle_ref ORDER BY vp.reported) as next_stop_next,
          LEAD(vp.reported) OVER (PARTITION BY vp.vehicle_ref ORDER BY vp.reported) as reported_next
        FROM vehicle_positions vp
        JOIN routes r ON r.id = vp.route_id
        JOIN stops s ON s.id = vp.next_stop_id
        WHERE vp.next_stop_id IS NOT NULL
        ${filter.whereClause}
      )
      SELECT
        stop_name,
        line_name,
        COUNT(*) as visit_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (reported_next - reported)))::numeric, 1) as avg_dwell_seconds,
        ROUND(MAX(EXTRACT(EPOCH FROM (reported_next - reported)))::numeric, 1) as max_dwell_seconds
      FROM stop_visits
      WHERE next_stop_next != next_stop_id
        AND EXTRACT(EPOCH FROM (reported_next - reported)) < 600
      GROUP BY stop_name, line_name
      HAVING COUNT(*) > 5
      ORDER BY avg_dwell_seconds DESC
      LIMIT 50
    `, filter.values);

    res.json(convertNumeric(result.rows, ['visit_count', 'avg_dwell_seconds', 'max_dwell_seconds']));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/geo-delays', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const result = await pool.query(`
      WITH delayed_positions AS (
        SELECT
          vp.lat,
          vp.lng,
          r.line_name,
          EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60 as delay_min
        FROM vehicle_positions vp
        JOIN routes r ON r.id = vp.route_id
        JOIN trips t ON t.id = vp.trip_id
        JOIN stop_times st ON st.trip_id = t.id AND st.stop_id = vp.next_stop_id
        WHERE vp.next_stop_id IS NOT NULL
        ${filter.whereClause}
      )
      SELECT
        ROUND(lat::numeric, 3) as lat_zone,
        ROUND(lng::numeric, 3) as lng_zone,
        COUNT(*) as samples,
        ROUND(AVG(delay_min)::numeric, 1) as avg_delay_min,
        STRING_AGG(DISTINCT line_name, ', ') as routes_affected
      FROM delayed_positions
      WHERE delay_min > 3
      GROUP BY lat_zone, lng_zone
      HAVING COUNT(*) > 10
      ORDER BY avg_delay_min DESC
      LIMIT 20
    `, filter.values);

    res.json(convertNumeric(result.rows, ['lat_zone', 'lng_zone', 'samples', 'avg_delay_min']));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bunching', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const result = await pool.query(`
      WITH latest_positions AS (
        SELECT DISTINCT ON (vehicle_ref)
          vp.*,
          r.line_name
        FROM vehicle_positions vp
        JOIN routes r ON r.id = vp.route_id
        WHERE vp.trip_id IS NOT NULL
        ${filter.whereClause}
        ORDER BY vp.vehicle_ref, vp.reported DESC
      ),
      route_times AS (
        SELECT
          route_id,
          line_name,
          vehicle_ref,
          reported,
          LAG(reported) OVER (PARTITION BY route_id ORDER BY reported) as prev_bus_time,
          LAG(vehicle_ref) OVER (PARTITION BY route_id ORDER BY reported) as prev_vehicle
        FROM latest_positions
      )
      SELECT
        line_name,
        vehicle_ref,
        prev_vehicle,
        reported,
        ROUND(EXTRACT(EPOCH FROM (reported - prev_bus_time)) / 60, 1) as minutes_behind_prev_bus
      FROM route_times
      WHERE EXTRACT(EPOCH FROM (reported - prev_bus_time)) / 60 BETWEEN 0.5 AND 2
      ORDER BY minutes_behind_prev_bus
    `, filter.values);

    res.json(convertNumeric(result.rows, ['minutes_behind_prev_bus']));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/route-hoppers', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const result = await pool.query(`
      SELECT
        vp.vehicle_ref,
        COUNT(DISTINCT r.line_name) as route_count,
        STRING_AGG(DISTINCT r.line_name, ', ' ORDER BY r.line_name) as routes_worked,
        MIN(vp.reported) as first_seen,
        MAX(vp.reported) as last_seen,
        ROUND(EXTRACT(EPOCH FROM (MAX(vp.reported) - MIN(vp.reported))) / 3600::numeric, 1) as hours_active
      FROM vehicle_positions vp
      JOIN routes r ON r.id = vp.route_id
      WHERE 1=1
      ${filter.whereClause}
      GROUP BY vp.vehicle_ref
      HAVING COUNT(DISTINCT r.line_name) > 1
      ORDER BY route_count DESC, hours_active DESC
    `, filter.values);

    res.json(convertNumeric(result.rows, ['route_count', 'hours_active']));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/data-quality', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const result = await pool.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT vehicle_ref) as distinct_vehicles,
        COUNT(DISTINCT DATE(ts)) as days_collected,
        ROUND(100.0 * COUNT(*) FILTER (WHERE route_id IS NOT NULL) / COUNT(*), 1) as route_match_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE trip_id IS NOT NULL) / COUNT(*), 1) as trip_match_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE api_trip_id IS NOT NULL) / COUNT(*), 1) as has_api_tripid_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE next_stop_id IS NOT NULL) / COUNT(*), 1) as has_next_stop_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE current_stop_id IS NOT NULL) / COUNT(*), 1) as has_curr_stop_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE bearing IS NOT NULL) / COUNT(*), 1) as has_bearing_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE occupancy IS NOT NULL) / COUNT(*), 1) as has_occupancy_pct,
        MIN(ts) as first_row,
        MAX(ts) as latest_row
      FROM vehicle_positions
      WHERE 1=1
      ${filter.whereClause.replace(/vp\./g, '')}
    `, filter.values);

    res.json(convertNumeric([result.rows[0]], [
      'total_rows', 'distinct_vehicles', 'days_collected',
      'route_match_pct', 'trip_match_pct', 'has_api_tripid_pct',
      'has_next_stop_pct', 'has_curr_stop_pct', 'has_bearing_pct', 'has_occupancy_pct'
    ])[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/metrics', async (req, res) => {
  try {
    // Handle preset filters
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const [fleet, punctuality, occupancy, stops] = await Promise.all([
      pool.query(`
        SELECT COUNT(DISTINCT vehicle_ref) as active_vehicles
        FROM vehicle_positions
        WHERE ts > NOW() - INTERVAL '1 hour'
        ${filter.whereClause.replace(/vp\./g, '')}
      `, filter.values),
      pool.query(`
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60)::numeric, 2) as avg_delay_min,
          ROUND((COUNT(*) FILTER (WHERE ABS(EXTRACT(EPOCH FROM (
            (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
          )) / 60) <= 2)::numeric / COUNT(*)::numeric * 100), 1) as on_time_pct,
          COUNT(*) as total_checks
        FROM vehicle_positions vp
        JOIN trips t ON t.id = vp.trip_id
        JOIN stop_times st ON st.trip_id = t.id AND st.stop_id = vp.next_stop_id
        WHERE vp.next_stop_id IS NOT NULL
        ${filter.whereClause}
      `, filter.values),
      pool.query(`
        SELECT
          ROUND((AVG(occupancy) * 100)::numeric, 1) as avg_occupancy_pct,
          COUNT(*) as samples_with_occupancy,
          ROUND((COUNT(*) FILTER (WHERE occupancy IS NOT NULL)::numeric / NULLIF(COUNT(*), 0)::numeric * 100), 1) as occupancy_coverage_pct
        FROM vehicle_positions
        WHERE 1=1
        ${filter.whereClause.replace(/vp\./g, '')}
      `, filter.values),
      pool.query(`
        SELECT COUNT(DISTINCT id) as total_stops
        FROM stops
      `)
    ]);

    res.json({
      activeVehicles: parseInt(fleet.rows[0].active_vehicles) || 0,
      avgDelay: parseFloat(punctuality.rows[0].avg_delay_min) || 0,
      onTimePercentage: parseFloat(punctuality.rows[0].on_time_pct) || 0,
      totalPunctualityChecks: parseInt(punctuality.rows[0].total_checks) || 0,
      avgOccupancy: parseFloat(occupancy.rows[0].avg_occupancy_pct) || 0,
      occupancyCoverage: parseFloat(occupancy.rows[0].occupancy_coverage_pct) || 0,
      totalStops: parseInt(stops.rows[0].total_stops) || 0,
      filters: { from: params.from, to: params.to, preset: params.preset }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vehicle/:id', async (req, res) => {
  try {
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const result = await pool.query(`
      SELECT
        vp.vehicle_ref,
        r.line_name,
        s.name as stop_name,
        vp.reported,
        vp.occupancy,
        vp.bearing,
        vp.lat,
        vp.lng
      FROM vehicle_positions vp
      LEFT JOIN routes r ON r.id = vp.route_id
      LEFT JOIN stops s ON s.id = vp.next_stop_id
      WHERE vp.vehicle_ref = $${filter.paramIndex}
      ${filter.whereClause}
      ORDER BY vp.reported DESC
      LIMIT 100
    `, [...filter.values, req.params.id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/route/:id', async (req, res) => {
  try {
    let params = { ...req.query };
    if (params.preset) {
      const presetDates = getPresetDates(params.preset);
      if (presetDates) {
        params.from = presetDates.from;
        params.to = presetDates.to;
      }
    }

    const filter = buildDateFilter(params);

    const [fleet, occupancy] = await Promise.all([
      pool.query(`
        SELECT
          vp.vehicle_ref,
          to_char(vp.reported AT TIME ZONE 'Europe/Guernsey', 'HH24:MI:SS') as time,
          COALESCE(ns.name, '—') as next_stop,
          vp.lat,
          vp.lng
        FROM vehicle_positions vp
        JOIN routes r ON r.id = vp.route_id
        LEFT JOIN stops ns ON ns.id = vp.next_stop_id
        WHERE r.line_name = $${filter.paramIndex}
          AND vp.ts = (SELECT MAX(ts2.ts) FROM vehicle_positions ts2 WHERE ts2.vehicle_ref = vp.vehicle_ref)
        ORDER BY vp.vehicle_ref
      `, [...filter.values, req.params.id]),
      pool.query(`
        SELECT
          ROUND((AVG(vp.occupancy) * 100)::numeric, 1) as avg_occupancy,
          COUNT(*) as samples
        FROM vehicle_positions vp
        JOIN routes r ON r.id = vp.route_id
        WHERE r.line_name = $${filter.paramIndex} AND vp.occupancy IS NOT NULL
      `, [...filter.values, req.params.id])
    ]);

    res.json({ 
      fleet: fleet.rows, 
      occupancy: convertNumeric([occupancy.rows[0]], ['avg_occupancy', 'samples'])[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/congestion', async (req, res) => {
  try {
    const windowMinutes = parseInt(req.query.window) || 30;
    const baselineWeeks = parseInt(req.query.baselineWeeks) || 4;
    const scoreThreshold = parseFloat(req.query.threshold) || 0.3;
    const hourFrom = req.query.hourFrom !== undefined ? parseInt(req.query.hourFrom) : null;
    const hourTo = req.query.hourTo !== undefined ? parseInt(req.query.hourTo) : null;
    const daysString = req.query.days || '';
    const daysArray = daysString ? daysString.split(',').map(d => parseInt(d)).filter(d => !isNaN(d)) : [];

    // Build optional hour filter
    let hourFilter = '';
    let hourFilterBaseline = '';
    if (hourFrom !== null && hourTo !== null) {
      hourFilter = `AND EXTRACT(HOUR FROM v1.reported AT TIME ZONE 'Europe/Guernsey') >= ${hourFrom}
                    AND EXTRACT(HOUR FROM v1.reported AT TIME ZONE 'Europe/Guernsey') < ${hourTo}`;
      hourFilterBaseline = hourFilter;
    } else if (hourFrom !== null) {
      hourFilter = `AND EXTRACT(HOUR FROM v1.reported AT TIME ZONE 'Europe/Guernsey') >= ${hourFrom}`;
      hourFilterBaseline = hourFilter;
    } else if (hourTo !== null) {
      hourFilter = `AND EXTRACT(HOUR FROM v1.reported AT TIME ZONE 'Europe/Guernsey') < ${hourTo}`;
      hourFilterBaseline = hourFilter;
    }

    // Build optional day filter
    let dayFilter = '';
    let dayFilterBaseline = '';
    if (daysArray.length > 0) {
      const dayPlaceholders = daysArray.map((_, i) => `$${4 + i}`).join(',');
      dayFilter = `AND EXTRACT(DOW FROM v1.reported) IN (${dayPlaceholders})`;
      dayFilterBaseline = dayFilter;
    }

    const result = await pool.query(`
      WITH current_segments AS (
        -- Recent speed segments within the time window
        SELECT
          ROUND(((v1.lat + v2.lat) / 2)::numeric, 4) AS mid_lat,
          ROUND(((v1.lng + v2.lng) / 2)::numeric, 4) AS mid_lng,
          v1.vehicle_ref,
          v1.route_id,
          r.line_name,
          EXTRACT(EPOCH FROM (v2.reported - v1.reported))::numeric AS gap_seconds,
          6371000 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(v1.lat)) * cos(radians(v2.lat)) *
              cos(radians(v2.lng) - radians(v1.lng)) +
              sin(radians(v1.lat)) * sin(radians(v2.lat))
            ))
          ) / NULLIF(EXTRACT(EPOCH FROM (v2.reported - v1.reported))::numeric, 0) * 2.237 AS speed_mph
        FROM vehicle_positions v1
        JOIN vehicle_positions v2 ON v2.vehicle_ref = v1.vehicle_ref
          AND v2.reported > v1.reported
          AND EXTRACT(EPOCH FROM (v2.reported - v1.reported)) BETWEEN 20 AND 40
        JOIN routes r ON r.id = v1.route_id
        WHERE v1.reported > NOW() - (($1::int || ' minutes')::INTERVAL)
          AND v1.lat IS NOT NULL AND v1.lng IS NOT NULL
          AND v2.lat IS NOT NULL AND v2.lng IS NOT NULL
          ${hourFilter}
          ${dayFilter}
          AND 6371000 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians(v1.lat)) * cos(radians(v2.lat)) *
            cos(radians(v2.lng) - radians(v1.lng)) +
            sin(radians(v1.lat)) * sin(radians(v2.lat))
          ))) > 10
          AND 6371000 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians(v1.lat)) * cos(radians(v2.lat)) *
            cos(radians(v2.lng) - radians(v1.lng)) +
            sin(radians(v1.lat)) * sin(radians(v2.lat))
          ))) / NULLIF(EXTRACT(EPOCH FROM (v2.reported - v1.reported))::numeric, 0) * 2.237 < 35
      ),
      current_cells AS (
        SELECT
          mid_lat,
          mid_lng,
          AVG(speed_mph)::numeric(5, 1) AS current_speed_mph,
          COUNT(DISTINCT vehicle_ref)::int AS vehicle_count,
          COUNT(DISTINCT route_id)::int AS route_count,
          STRING_AGG(DISTINCT line_name, ', ' ORDER BY line_name) AS routes
        FROM current_segments
        GROUP BY mid_lat, mid_lng
      ),
      baseline_segments AS (
        SELECT
          ROUND(((v1.lat + v2.lat) / 2)::numeric, 4) AS mid_lat,
          ROUND(((v1.lng + v2.lng) / 2)::numeric, 4) AS mid_lng,
          6371000 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(v1.lat)) * cos(radians(v2.lat)) *
              cos(radians(v2.lng) - radians(v1.lng)) +
              sin(radians(v1.lat)) * sin(radians(v2.lat))
            ))
          ) / NULLIF(EXTRACT(EPOCH FROM (v2.reported - v1.reported))::numeric, 0) * 2.237 AS speed_mph
        FROM vehicle_positions v1
        JOIN vehicle_positions v2 ON v2.vehicle_ref = v1.vehicle_ref
          AND v2.reported > v1.reported
          AND EXTRACT(EPOCH FROM (v2.reported - v1.reported)) BETWEEN 20 AND 40
        WHERE v1.reported > NOW() - (($2::int || ' weeks')::INTERVAL)
          AND v1.reported < NOW() - (($1::int || ' minutes')::INTERVAL)
          AND v1.lat IS NOT NULL AND v1.lng IS NOT NULL
          AND v2.lat IS NOT NULL AND v2.lng IS NOT NULL
          ${hourFilterBaseline}
          ${dayFilterBaseline}
          AND 6371000 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians(v1.lat)) * cos(radians(v2.lat)) *
            cos(radians(v2.lng) - radians(v1.lng)) +
            sin(radians(v1.lat)) * sin(radians(v2.lat))
          ))) > 10
          AND 6371000 * acos(LEAST(1.0, GREATEST(-1.0,
            cos(radians(v1.lat)) * cos(radians(v2.lat)) *
            cos(radians(v2.lng) - radians(v1.lng)) +
            sin(radians(v1.lat)) * sin(radians(v2.lat))
          ))) / NULLIF(EXTRACT(EPOCH FROM (v2.reported - v1.reported))::numeric, 0) * 2.237 < 35
      ),
      baseline_cells AS (
        SELECT
          mid_lat,
          mid_lng,
          AVG(speed_mph)::numeric(5, 1) AS baseline_speed_mph,
          COUNT(*)::int AS baseline_samples
        FROM baseline_segments
        GROUP BY mid_lat, mid_lng
        HAVING COUNT(*) >= 3
      )
      SELECT
        cc.mid_lat AS lat,
        cc.mid_lng AS lng,
        cc.current_speed_mph,
        bc.baseline_speed_mph,
        ROUND(((bc.baseline_speed_mph - cc.current_speed_mph) /
          NULLIF(bc.baseline_speed_mph, 0))::numeric, 2) AS congestion_score,
        cc.vehicle_count,
        cc.route_count,
        cc.routes,
        bc.baseline_samples
      FROM current_cells cc
      LEFT JOIN baseline_cells bc ON bc.mid_lat = cc.mid_lat AND bc.mid_lng = cc.mid_lng
      WHERE bc.baseline_speed_mph IS NOT NULL
        AND ((bc.baseline_speed_mph - cc.current_speed_mph) /
          NULLIF(bc.baseline_speed_mph, 0)) >= $3
      ORDER BY congestion_score DESC
      LIMIT 50
    `, [windowMinutes, baselineWeeks, scoreThreshold, ...daysArray]);

    const scores = result.rows.map(r => parseFloat(r.congestion_score) || 0);
    const avgScore = scores.length > 0 ?
      (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;

    res.json({
      generated_at: new Date().toISOString(),
      window_minutes: windowMinutes,
      baseline_weeks: baselineWeeks,
      score_threshold: scoreThreshold,
      hotspots: convertNumeric(result.rows, [
        'lat', 'lng', 'current_speed_mph', 'baseline_speed_mph',
        'congestion_score', 'vehicle_count', 'route_count', 'baseline_samples'
      ]),
      summary: {
        total_hotspots: result.rows.length,
        avg_congestion_score: parseFloat(avgScore),
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Congestion API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Dashboard API running on port ${port}`);
});
