WITH vehicle_gaps AS (
  SELECT
    vehicle_ref,
    reported,
    LEAD(reported) OVER (PARTITION BY vehicle_ref ORDER BY reported) as next_seen,
    r.line_name
  FROM vehicle_positions vp
  JOIN routes r ON r.id = vp.route_id
)
SELECT
  vehicle_ref,
  line_name,
  reported as disappeared_at,
  next_seen as reappeared_at,
  ROUND(EXTRACT(EPOCH FROM (next_seen - reported)) / 60::numeric, 1) as missing_minutes
FROM vehicle_gaps
WHERE EXTRACT(EPOCH FROM (next_seen - reported)) / 60 > 10  -- 10+ min gaps
  AND EXTRACT(EPOCH FROM (next_seen - reported)) / 60 < 120  -- but not end of shift
ORDER BY missing_minutes DESC;
