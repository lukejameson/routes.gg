WITH occupancy_changes AS (
  SELECT
    vp.vehicle_ref,
    r.line_name,
    s.name as stop_name,
    vp.occupancy,
    LAG(vp.occupancy) OVER (PARTITION BY vp.vehicle_ref ORDER BY vp.reported) as prev_occupancy,
    vp.reported
  FROM vehicle_positions vp
  JOIN routes r ON r.id = vp.route_id
  LEFT JOIN stops s ON s.id = vp.next_stop_id
  WHERE vp.occupancy IS NOT NULL
)
SELECT
  line_name,
  stop_name,
  ROUND((occupancy * 100)::numeric, 1) as occupancy_pct,
  ROUND((prev_occupancy * 100)::numeric, 1) as prev_occupancy_pct,
  ROUND(((occupancy - prev_occupancy) * 100)::numeric, 1) as surge_pct,
  reported
FROM occupancy_changes
WHERE prev_occupancy IS NOT NULL
  AND (occupancy - prev_occupancy) > 0.2  -- 20%+ jump
ORDER BY (occupancy - prev_occupancy) DESC;
