-- Average occupancy by route (only rows where occupancy was reported)
SELECT
  r.line_name                                      AS "Route",
  COUNT(*)                                         AS "Samples",
  ROUND((AVG(vp.occupancy) * 100)::numeric, 1)     AS "Avg Occupancy %",
  ROUND((MAX(vp.occupancy) * 100)::numeric, 1)     AS "Peak Occupancy %",
  COUNT(*) FILTER (WHERE vp.occupancy < 0.33)     AS "Low",
  COUNT(*) FILTER (WHERE vp.occupancy BETWEEN 0.33 AND 0.66) AS "Medium",
  COUNT(*) FILTER (WHERE vp.occupancy > 0.66)     AS "High"
FROM vehicle_positions vp
JOIN routes r ON r.id = vp.route_id
WHERE vp.occupancy IS NOT NULL
GROUP BY r.line_name
ORDER BY "Avg Occupancy %" DESC;
