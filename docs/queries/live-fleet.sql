-- Live fleet snapshot — one row per vehicle, most recent position
SELECT
  to_char(vp.reported AT TIME ZONE 'Europe/Guernsey', 'HH24:MI:SS')  AS "Time",
  vp.vehicle_ref                                                       AS "Vehicle",
  r.line_name                                                          AS "Route",
  CASE vp.direction WHEN 0 THEN 'In' WHEN 1 THEN 'Out' ELSE '?' END  AS "Dir",
  COALESCE(vp.destination, t.headsign, '—')                           AS "Destination",
  to_char(t.first_departure, 'HH24:MI')                               AS "Dep",
  COALESCE(cs.name, '—')                                              AS "At Stop",
  COALESCE(ns.name, '—')                                              AS "Next Stop",
  total_stops.n                                                        AS "Total",
  COALESCE(next_seq.seq, 0)                                           AS "Done",
  total_stops.n - COALESCE(next_seq.seq, 0)                          AS "Left",
  ROUND(100.0 * COALESCE(next_seq.seq, 0) / NULLIF(total_stops.n, 0)) || '%' AS "Pct"
FROM vehicle_positions vp
JOIN routes r    ON r.id  = vp.route_id
JOIN trips  t    ON t.id  = vp.trip_id
LEFT JOIN stops cs ON cs.id = vp.current_stop_id
LEFT JOIN stops ns ON ns.id = vp.next_stop_id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS n FROM stop_times WHERE trip_id = t.id
) total_stops ON true
LEFT JOIN LATERAL (
  SELECT seq FROM stop_times
  WHERE trip_id = t.id AND stop_id = vp.next_stop_id
  LIMIT 1
) next_seq ON true
WHERE vp.ts = (
  SELECT MAX(ts2.ts) FROM vehicle_positions ts2
  WHERE ts2.vehicle_ref = vp.vehicle_ref
)
ORDER BY r.line_name, vp.vehicle_ref;
