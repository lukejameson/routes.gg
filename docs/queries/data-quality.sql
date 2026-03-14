-- Data quality overview — field coverage and match rates
SELECT
  COUNT(*)                                                              AS "Total Rows",
  COUNT(DISTINCT vehicle_ref)                                           AS "Distinct Vehicles",
  COUNT(DISTINCT DATE(ts))                                              AS "Days Collected",
  ROUND(100.0 * COUNT(*) FILTER (WHERE route_id        IS NOT NULL) / COUNT(*), 1) AS "Route Match %",
  ROUND(100.0 * COUNT(*) FILTER (WHERE trip_id         IS NOT NULL) / COUNT(*), 1) AS "Trip Match %",
  ROUND(100.0 * COUNT(*) FILTER (WHERE api_trip_id     IS NOT NULL) / COUNT(*), 1) AS "Has API TripID %",
  ROUND(100.0 * COUNT(*) FILTER (WHERE next_stop_id    IS NOT NULL) / COUNT(*), 1) AS "Has Next Stop %",
  ROUND(100.0 * COUNT(*) FILTER (WHERE current_stop_id IS NOT NULL) / COUNT(*), 1) AS "Has Curr Stop %",
  ROUND(100.0 * COUNT(*) FILTER (WHERE bearing         IS NOT NULL) / COUNT(*), 1) AS "Has Bearing %",
  ROUND(100.0 * COUNT(*) FILTER (WHERE occupancy       IS NOT NULL) / COUNT(*), 1) AS "Has Occupancy %",
  MIN(ts) AS "First Row",
  MAX(ts) AS "Latest Row"
FROM vehicle_positions;

-- Unmatched routes (if any)
SELECT raw_route_name, COUNT(*) AS occurrences
FROM vehicle_positions
WHERE route_id IS NULL AND raw_route_name IS NOT NULL
GROUP BY raw_route_name
ORDER BY occurrences DESC;

-- ---------------------------------------------------------------------------
-- GPS-inferred stop proximity
-- Haversine distance (metres) between bus position and each stop.
-- "At stop"   = within 40m  (bus is stopped / just departing)
-- "Near stop" = within 150m (bus is approaching)
-- Compares API-provided IDs vs what GPS alone can tell us.
-- ---------------------------------------------------------------------------
WITH distances AS (
  SELECT
    vp.id                        AS vp_id,
    vp.current_stop_id           AS api_current,
    vp.next_stop_id              AS api_next,
    nearest.dist_m               AS nearest_stop_m
  FROM vehicle_positions vp
  -- Bounding box pre-filter (~500m box) keeps only nearby stops before Haversine
  JOIN LATERAL (
    SELECT
      6371000 * 2 * asin(sqrt(
        power(sin(radians((s.lat - vp.lat) / 2)), 2) +
        cos(radians(vp.lat)) * cos(radians(s.lat)) *
        power(sin(radians((s.lng - vp.lng) / 2)), 2)
      )) AS dist_m
    FROM stops s
    WHERE s.lat BETWEEN vp.lat - 0.005 AND vp.lat + 0.005
      AND s.lng BETWEEN vp.lng - 0.007 AND vp.lng + 0.007
    ORDER BY power(s.lat - vp.lat, 2) + power(s.lng - vp.lng, 2)
    LIMIT 1
  ) nearest ON true
)
SELECT
  COUNT(*)                                                               AS "Total",
  -- API-provided
  ROUND(100.0 * COUNT(*) FILTER (WHERE api_current IS NOT NULL) / COUNT(*), 1) AS "API Curr Stop %",
  ROUND(100.0 * COUNT(*) FILTER (WHERE api_next    IS NOT NULL) / COUNT(*), 1) AS "API Next Stop %",
  -- GPS-inferred
  ROUND(100.0 * COUNT(*) FILTER (WHERE nearest_stop_m <= 40)  / COUNT(*), 1)  AS "GPS At Stop % (≤40m)",
  ROUND(100.0 * COUNT(*) FILTER (WHERE nearest_stop_m <= 150) / COUNT(*), 1)  AS "GPS Near Stop % (≤150m)",
  -- Gap: positions with no API stop ID but GPS shows they are near one
  COUNT(*) FILTER (WHERE api_current IS NULL AND nearest_stop_m <= 40)         AS "Missing curr but GPS at stop",
  COUNT(*) FILTER (WHERE api_next    IS NULL AND nearest_stop_m <= 150)        AS "Missing next but GPS near stop",
  -- Average nearest stop distance
  ROUND(AVG(nearest_stop_m)::numeric, 1)                                       AS "Avg nearest stop (m)",
  ROUND(MIN(nearest_stop_m)::numeric, 1)                                       AS "Min nearest stop (m)",
  ROUND(MAX(nearest_stop_m)::numeric, 1)                                       AS "Max nearest stop (m)"
FROM distances;

-- Per-route breakdown of GPS proximity vs API stop coverage
SELECT
  r.line_name                                                                    AS "Route",
  COUNT(*)                                                                       AS "Samples",
  ROUND(100.0 * COUNT(*) FILTER (WHERE vp.next_stop_id IS NOT NULL) / COUNT(*), 1) AS "API Next %",
  ROUND(AVG(nearest_stop_m)::numeric, 1)                                        AS "Avg Dist to Stop (m)",
  COUNT(*) FILTER (WHERE vp.next_stop_id IS NULL AND nearest_stop_m <= 150)     AS "Recoverable via GPS"
FROM vehicle_positions vp
JOIN routes r ON r.id = vp.route_id
JOIN LATERAL (
  SELECT
    6371000 * 2 * asin(sqrt(
      power(sin(radians((s.lat - vp.lat) / 2)), 2) +
      cos(radians(vp.lat)) * cos(radians(s.lat)) *
      power(sin(radians((s.lng - vp.lng) / 2)), 2)
    )) AS nearest_stop_m
  FROM stops s
  WHERE s.lat BETWEEN vp.lat - 0.005 AND vp.lat + 0.005
    AND s.lng BETWEEN vp.lng - 0.007 AND vp.lng + 0.007
  ORDER BY power(s.lat - vp.lat, 2) + power(s.lng - vp.lng, 2)
  LIMIT 1
) dist ON true
GROUP BY r.line_name
ORDER BY "Recoverable via GPS" DESC;
