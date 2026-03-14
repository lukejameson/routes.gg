WITH route_times AS (
  SELECT
    vp.route_id,
    r.line_name,
    vp.vehicle_ref,
    vp.reported,
    LAG(vp.reported) OVER (PARTITION BY vp.route_id ORDER BY vp.reported) as prev_bus_time,
    LAG(vp.vehicle_ref) OVER (PARTITION BY vp.route_id ORDER BY vp.reported) as prev_vehicle
  FROM vehicle_positions vp
  JOIN routes r ON r.id = vp.route_id
  WHERE vp.trip_id IS NOT NULL
)
SELECT
  line_name,
  vehicle_ref,
  prev_vehicle,
  reported,
  EXTRACT(EPOCH FROM (reported - prev_bus_time)) / 60 as minutes_behind_prev_bus
FROM route_times
WHERE EXTRACT(EPOCH FROM (reported - prev_bus_time)) / 60 < 2
ORDER BY minutes_behind_prev_bus;
