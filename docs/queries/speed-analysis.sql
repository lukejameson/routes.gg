-- SPEED ANALYSIS - mph version with GPS error filtering
WITH speed_calc AS (
  SELECT
    vp.vehicle_ref,
    r.line_name,
    vp.reported,
    vp.lat, vp.lng,
    LAG(vp.lat) OVER w as prev_lat,
    LAG(vp.lng) OVER w as prev_lng,
    LAG(vp.reported) OVER w as prev_time,
    -- Haversine distance in meters with clamped acos input
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
  AND (distance_m / NULLIF(EXTRACT(EPOCH FROM (reported - prev_time)), 0) * 2.23694) < 35  -- filter >35 mph as GPS errors
  AND distance_m > 10
ORDER BY speed_mph DESC NULLS LAST
LIMIT 50;
