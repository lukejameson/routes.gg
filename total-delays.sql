-- Active: 1749725314719@@127.0.0.1@5432@stopsgg
 SELECT
    r.line_name                                                        AS "Route",
    COUNT(*)                                                           AS "Samples",
    ROUND(AVG(
      EXTRACT(EPOCH FROM (
        (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
      )) / 60
    ), 1)                                                              AS "Avg Delay (min)",
    ROUND(MAX(
      EXTRACT(EPOCH FROM (
        (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
      )) / 60
    ), 1)                                                              AS "Max Delay (min)",
    ROUND(MIN(
      EXTRACT(EPOCH FROM (
        (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
      )) / 60
    ), 1)                                                              AS "Max Early (min)",
    COUNT(*) FILTER (WHERE
      EXTRACT(EPOCH FROM (
        (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
      )) / 60 > 2
    )                                                                  AS "Late Samples",
    COUNT(*) FILTER (WHERE
      ABS(EXTRACT(EPOCH FROM (
        (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
      )) / 60) <= 2
    )                                                                  AS "On Time Samples",
    ROUND(100.0 * COUNT(*) FILTER (WHERE
      ABS(EXTRACT(EPOCH FROM (
        (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
      )) / 60) <= 2
    ) / NULLIF(COUNT(*), 0), 1)                                       AS "On Time %"
  FROM vehicle_positions vp
  JOIN routes r ON r.id = vp.route_id
  JOIN trips  t ON t.id = vp.trip_id
  JOIN LATERAL (
    SELECT st.departure FROM stop_times st
    WHERE st.trip_id = t.id AND st.stop_id = vp.next_stop_id
    LIMIT 1
  ) sched_next ON true
  WHERE vp.next_stop_id IS NOT NULL
  GROUP BY r.line_name
  ORDER BY "Avg Delay (min)" DESC;
