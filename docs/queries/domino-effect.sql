WITH bus_sequence AS (
  SELECT
    r.line_name,
    vp.vehicle_ref,
    vp.reported,
    EXTRACT(EPOCH FROM (
      (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
    )) / 60 as delay_min,
    LAG(EXTRACT(EPOCH FROM (
      (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
    )) / 60) OVER (PARTITION BY r.line_name, vp.next_stop_id ORDER BY vp.reported) as prev_bus_delay
  FROM vehicle_positions vp
  JOIN routes r ON r.id = vp.route_id
  JOIN trips t ON t.id = vp.trip_id
  JOIN stop_times st ON st.trip_id = t.id AND st.stop_id = vp.next_stop_id
  WHERE vp.next_stop_id IS NOT NULL
)
SELECT
  line_name,
  CASE
    WHEN prev_bus_delay > 5 THEN 'Previous bus >5min late'
    WHEN prev_bus_delay BETWEEN 2 AND 5 THEN 'Previous bus 2-5min late'
    WHEN prev_bus_delay BETWEEN -2 AND 2 THEN 'Previous bus on time'
    ELSE 'Previous bus early'
  END as prev_bus_status,
  COUNT(*) as samples,
  ROUND(AVG(delay_min)::numeric, 1) as avg_delay_this_bus,
  ROUND(AVG(prev_bus_delay)::numeric, 1) as avg_delay_prev_bus
FROM bus_sequence
WHERE prev_bus_delay IS NOT NULL
GROUP BY line_name,
  CASE
    WHEN prev_bus_delay > 5 THEN 'Previous bus >5min late'
    WHEN prev_bus_delay BETWEEN 2 AND 5 THEN 'Previous bus 2-5min late'
    WHEN prev_bus_delay BETWEEN -2 AND 2 THEN 'Previous bus on time'
    ELSE 'Previous bus early'
  END
ORDER BY line_name, avg_delay_prev_bus DESC;
