SELECT
  s.name as stop_name,
  EXTRACT(HOUR FROM vp.reported AT TIME ZONE 'Europe/Guernsey')::int as hour,
  COUNT(DISTINCT vp.vehicle_ref) as bus_count,
  COUNT(*) as position_samples,
  ROUND(AVG(vp.occupancy * 100)::numeric, 1) as avg_occupancy_pct
FROM vehicle_positions vp
JOIN stops s ON s.id = vp.next_stop_id
WHERE vp.next_stop_id IS NOT NULL
GROUP BY s.name, hour
HAVING COUNT(DISTINCT vp.vehicle_ref) > 3
ORDER BY bus_count DESC, hour;
