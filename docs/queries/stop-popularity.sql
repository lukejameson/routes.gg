-- Most visited stops — how often vehicles are observed heading to each stop
SELECT
  s.name                          AS "Stop",
  COUNT(*)                        AS "Observations",
  COUNT(DISTINCT vp.vehicle_ref)  AS "Distinct Vehicles",
  COUNT(DISTINCT r.id)            AS "Distinct Routes",
  string_agg(DISTINCT r.line_name, ', ' ORDER BY r.line_name) AS "Routes"
FROM vehicle_positions vp
JOIN stops s  ON s.id  = vp.next_stop_id
JOIN routes r ON r.id  = vp.route_id
GROUP BY s.name
ORDER BY COUNT(*) DESC
LIMIT 20;
