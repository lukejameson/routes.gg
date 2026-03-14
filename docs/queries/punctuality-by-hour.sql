-- Average delay by hour of day — reveals peak congestion periods
SELECT
  EXTRACT(HOUR FROM vp.reported AT TIME ZONE 'Europe/Guernsey')::int  AS "Hour",
  COUNT(*)                                                              AS "Samples",
  ROUND(AVG(
    EXTRACT(EPOCH FROM (
      (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
    )) / 60
  ), 1)                                                                 AS "Avg Delay (min)",
  ROUND(100.0 * COUNT(*) FILTER (WHERE
    ABS(EXTRACT(EPOCH FROM (
      (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched_next.departure
    )) / 60) <= 2
  ) / NULLIF(COUNT(*), 0), 1)                                          AS "On Time %"
FROM vehicle_positions vp
JOIN trips t ON t.id = vp.trip_id
JOIN LATERAL (
  SELECT st.departure FROM stop_times st
  WHERE st.trip_id = t.id AND st.stop_id = vp.next_stop_id
  LIMIT 1
) sched_next ON true
WHERE vp.next_stop_id IS NOT NULL
GROUP BY 1
ORDER BY 1;
