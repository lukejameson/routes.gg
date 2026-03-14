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
)
SELECT
  ROUND(lat::numeric, 3) as lat_zone,
  ROUND(lng::numeric, 3) as lng_zone,
  COUNT(*) as samples,
  ROUND(AVG(delay_min)::numeric, 1) as avg_delay_min,
  STRING_AGG(DISTINCT line_name, ', ') as routes_affected
FROM delayed_positions
WHERE delay_min > 3  -- only delayed buses
GROUP BY lat_zone, lng_zone
HAVING COUNT(*) > 10
ORDER BY avg_delay_min DESC
LIMIT 20;
