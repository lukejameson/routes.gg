WITH occupancy_deltas AS (
  SELECT
    r.line_name,
    s.name as stop_name,
    vp.occupancy - LAG(vp.occupancy) OVER (PARTITION BY vp.vehicle_ref ORDER BY vp.reported) as occupancy_change,
    vp.occupancy,
    vp.reported
  FROM vehicle_positions vp
  JOIN routes r ON r.id = vp.route_id
  LEFT JOIN stops s ON s.id = vp.next_stop_id
  WHERE vp.occupancy IS NOT NULL
)
SELECT
  stop_name,
  line_name,
  COUNT(*) as surge_events,
  ROUND(AVG(occupancy_change * 100)::numeric, 1) as avg_surge_pct,
  ROUND(MAX(occupancy_change * 100)::numeric, 1) as max_surge_pct
FROM occupancy_deltas
WHERE occupancy_change > 0.15  -- 15%+ jump = major boarding
  AND stop_name IS NOT NULL
GROUP BY stop_name, line_name
ORDER BY avg_surge_pct DESC
LIMIT 30;
