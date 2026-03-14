SELECT
  vp.vehicle_ref,
  COUNT(DISTINCT r.line_name) as route_count,
  STRING_AGG(DISTINCT r.line_name, ', ' ORDER BY r.line_name) as routes_worked,
  MIN(vp.reported) as first_seen,
  MAX(vp.reported) as last_seen,
  ROUND(EXTRACT(EPOCH FROM (MAX(vp.reported) - MIN(vp.reported))) / 3600::numeric, 1) as hours_active
FROM vehicle_positions vp
JOIN routes r ON r.id = vp.route_id
GROUP BY vp.vehicle_ref
HAVING COUNT(DISTINCT r.line_name) > 1
ORDER BY route_count DESC, hours_active DESC;
