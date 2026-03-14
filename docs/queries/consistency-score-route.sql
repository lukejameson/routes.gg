SELECT
  r.line_name,
  COUNT(*) as samples,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (
      (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
    )) / 60
  )::numeric, 1) as avg_delay_min,
  ROUND(STDDEV(
    EXTRACT(EPOCH FROM (
      (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
    )) / 60
  )::numeric, 1) as stddev_delay_min,
  ROUND((100.0 * STDDEV(
    EXTRACT(EPOCH FROM (
      (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
    )) / 60
  ) / NULLIF(AVG(ABS(
    EXTRACT(EPOCH FROM (
      (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - st.departure
    )) / 60
  )), 0))::numeric, 1) as unreliability_score
FROM vehicle_positions vp
JOIN routes r ON r.id = vp.route_id
JOIN trips t ON t.id = vp.trip_id
JOIN stop_times st ON st.trip_id = t.id AND st.stop_id = vp.next_stop_id
WHERE vp.next_stop_id IS NOT NULL
GROUP BY r.line_name
HAVING COUNT(*) > 50
ORDER BY stddev_delay_min DESC;
