-- Active: 1749725314719@@127.0.0.1@5432@stopsgg
-- Live punctuality — how early/late each vehicle is vs timetable at their next stop
SELECT
  r.line_name                                                           AS "Route",
  vp.vehicle_ref                                                        AS "Vehicle",
  CASE vp.direction WHEN 0 THEN 'In' WHEN 1 THEN 'Out' END             AS "Dir",
  to_char(t.first_departure, 'HH24:MI')                                AS "Sched Dep",
  to_char(
    (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - t.first_departure,
    'HH24:MI'
  )                                                                     AS "Elapsed",
  to_char(sched_next.departure, 'HH24:MI')                             AS "Sched@Next",
  to_char((vp.reported AT TIME ZONE 'Europe/Guernsey')::time, 'HH24:MI') AS "Actual@Next",
  CASE
    WHEN sched_next.departure IS NULL THEN '—'
    WHEN (vp.reported AT TIME ZONE 'Europe/Guernsey')::time > sched_next.departure
      THEN '+' || EXTRACT(EPOCH FROM (
        (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
      ))::int / 60 || ' min late'
    WHEN (vp.reported AT TIME ZONE 'Europe/Guernsey')::time < sched_next.departure
      THEN '-' || EXTRACT(EPOCH FROM (
        sched_next.departure - (vp.reported AT TIME ZONE 'Europe/Guernsey')::time
      ))::int / 60 || ' min early'
    ELSE 'On time'
  END                                                                   AS "Variance",
  ns.name                                                               AS "Next Stop",
  to_char(last_st.departure - t.first_departure, 'HH24:MI')            AS "Sched Duration"
FROM vehicle_positions vp
JOIN routes r ON r.id = vp.route_id
JOIN trips  t ON t.id = vp.trip_id
LEFT JOIN stops ns ON ns.id = vp.next_stop_id
LEFT JOIN LATERAL (
  SELECT st.departure FROM stop_times st
  WHERE st.trip_id = t.id AND st.stop_id = vp.next_stop_id
  LIMIT 1
) sched_next ON true
LEFT JOIN LATERAL (
  SELECT st.departure FROM stop_times st
  WHERE st.trip_id = t.id
  ORDER BY st.seq DESC LIMIT 1
) last_st ON true
WHERE vp.ts = (
  SELECT MAX(ts2.ts) FROM vehicle_positions ts2
  WHERE ts2.vehicle_ref = vp.vehicle_ref
)
  AND vp.next_stop_id IS NOT NULL
ORDER BY r.line_name;
