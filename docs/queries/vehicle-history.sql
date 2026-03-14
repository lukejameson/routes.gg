-- Active: 1749725314719@@127.0.0.1@5432@stopsgg
-- Journey history for a single vehicle — replace :vehicle_ref with e.g. '34516'
-- Shows every recorded position in order with schedule comparison
SELECT
  to_char(vp.reported AT TIME ZONE 'Europe/Guernsey', 'HH24:MI:SS')  AS "Time",
  r.line_name                                                          AS "Route",
  CASE vp.direction WHEN 0 THEN 'Inbound' WHEN 1 THEN 'Outbound' END AS "Dir",
  COALESCE(cs.name, '—')                                              AS "At Stop",
  COALESCE(ns.name, '—')                                              AS "Next Stop",
  to_char(sched_next.departure, 'HH24:MI')                            AS "Sched@Next",
  CASE
    WHEN sched_next.departure IS NULL THEN '—'
    WHEN (vp.reported AT TIME ZONE 'Europe/Guernsey')::time > sched_next.departure
      THEN '+' || EXTRACT(EPOCH FROM (
        (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
      ))::int / 60 || 'm late'
    WHEN (vp.reported AT TIME ZONE 'Europe/Guernsey')::time < sched_next.departure
      THEN '-' || EXTRACT(EPOCH FROM (
        sched_next.departure - (vp.reported AT TIME ZONE 'Europe/Guernsey')::time
      ))::int / 60 || 'm early'
    ELSE 'On time'
  END                                                                  AS "Variance",
  ROUND(vp.lat::numeric, 5) || ', ' || ROUND(vp.lng::numeric, 5)     AS "Position",
  vp.bearing                                                          AS "Bearing"
FROM vehicle_positions vp
JOIN routes r ON r.id = vp.route_id
LEFT JOIN trips t  ON t.id  = vp.trip_id
LEFT JOIN stops cs ON cs.id = vp.current_stop_id
LEFT JOIN stops ns ON ns.id = vp.next_stop_id
LEFT JOIN LATERAL (
  SELECT st.departure FROM stop_times st
  WHERE st.trip_id = t.id AND st.stop_id = vp.next_stop_id
  LIMIT 1
) sched_next ON true
WHERE vp.vehicle_ref = '34516'  -- << change this
ORDER BY vp.reported;
