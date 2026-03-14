WITH terminus_visits AS (
  SELECT
    vp.vehicle_ref,
    r.line_name,
    vp.direction,
    vp.reported,
    LAG(vp.direction) OVER (PARTITION BY vp.vehicle_ref ORDER BY vp.reported) as prev_direction,
    LAG(vp.reported) OVER (PARTITION BY vp.vehicle_ref ORDER BY vp.reported) as prev_time
  FROM vehicle_positions vp
  JOIN routes r ON r.id = vp.route_id
  WHERE vp.direction IS NOT NULL
)
SELECT
  line_name,
  COUNT(*) as turnarounds,
  ROUND(AVG(EXTRACT(EPOCH FROM (reported - prev_time)) / 60)::numeric, 1) as avg_turnaround_min,
  ROUND(MIN(EXTRACT(EPOCH FROM (reported - prev_time)) / 60)::numeric, 1) as min_turnaround_min,
  ROUND(MAX(EXTRACT(EPOCH FROM (reported - prev_time)) / 60)::numeric, 1) as max_turnaround_min
FROM terminus_visits
WHERE prev_direction IS NOT NULL
  AND direction != prev_direction  -- direction change = turnaround
  AND EXTRACT(EPOCH FROM (reported - prev_time)) / 60 < 30  -- under 30 min
GROUP BY line_name
ORDER BY avg_turnaround_min DESC;
