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
)
SELECT
  stop_name,
  line_name,
  COUNT(*) as visit_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (reported_next - reported)))::numeric, 1) as avg_dwell_seconds,
  ROUND(MAX(EXTRACT(EPOCH FROM (reported_next - reported)))::numeric, 1) as max_dwell_seconds
FROM stop_visits
WHERE next_stop_next != next_stop_id  -- bus moved to different stop
  AND EXTRACT(EPOCH FROM (reported_next - reported)) < 600  -- under 10 min
GROUP BY stop_name, line_name
HAVING COUNT(*) > 5
ORDER BY avg_dwell_seconds DESC;
