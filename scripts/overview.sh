#!/usr/bin/env bash
# Quick overview of the stopsgg tracker — run with: bash scripts/overview.sh

SEP=$'\x1f'  # ASCII unit separator — safe delimiter
Q() { docker exec -u postgres postgres psql -U manga_user -d stopsgg -t -A -F"$SEP" -c "$1"; }

echo ""
echo "======================================================"
echo "  STOPSGG — TRACKER OVERVIEW"
echo "  $(date '+%A %d %B %Y, %H:%M')"
echo "======================================================"

# ── Collection health ─────────────────────────────────────
echo ""
echo "[ DATA COLLECTION ]"
Q "
SELECT
  COUNT(*),
  COUNT(DISTINCT vehicle_ref),
  ROUND(EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 3600, 1),
  ROUND(100.0 * COUNT(*) FILTER (WHERE trip_id      IS NOT NULL) / NULLIF(COUNT(*),0), 1),
  ROUND(100.0 * COUNT(*) FILTER (WHERE next_stop_id IS NOT NULL) / NULLIF(COUNT(*),0), 1),
  (MIN(ts) AT TIME ZONE 'Europe/Guernsey')::time(0),
  (MAX(ts) AT TIME ZONE 'Europe/Guernsey')::time(0)
FROM vehicle_positions;" | while IFS="$SEP" read total veh hrs trip stop first last; do
  echo "  Positions collected : $total"
  echo "  Distinct vehicles   : $veh"
  echo "  Hours of data       : $hrs"
  echo "  Trip match rate     : ${trip}%"
  echo "  Next stop coverage  : ${stop}%"
  echo "  Data window         : $first → $last (Guernsey time)"
done

# ── Live fleet ────────────────────────────────────────────
echo ""
echo "[ LIVE FLEET ]"
Q "
SELECT
  r.line_name,
  vp.vehicle_ref,
  CASE vp.direction WHEN 0 THEN 'In ' WHEN 1 THEN 'Out' ELSE '?  ' END,
  COALESCE(vp.destination, t.headsign, '—'),
  to_char(vp.reported AT TIME ZONE 'Europe/Guernsey', 'HH24:MI'),
  COALESCE(ns.name, '(between stops)')
FROM vehicle_positions vp
JOIN routes r ON r.id = vp.route_id
LEFT JOIN trips t  ON t.id  = vp.trip_id
LEFT JOIN stops ns ON ns.id = vp.next_stop_id
WHERE vp.ts = (SELECT MAX(t2.ts) FROM vehicle_positions t2 WHERE t2.vehicle_ref = vp.vehicle_ref)
ORDER BY
  CASE WHEN r.line_name ~ '^\d+$' THEN r.line_name::integer ELSE 999 END,
  r.line_name;" | \
awk -F"$SEP" -v sep="$SEP" 'NF==6 {
  printf "  Route %-6s  Veh %-6s  [%s]  %-32s  %s  → %s\n", $1, $2, $3, substr($4,1,32), $5, $6
}'

# ── Punctuality ───────────────────────────────────────────
echo ""
echo "[ PUNCTUALITY BY ROUTE  (+ = late, - = early, OK = within ±2 min) ]"
Q "
SELECT
  r.line_name,
  COUNT(*),
  ROUND(AVG(EXTRACT(EPOCH FROM (
    (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched.departure
  )) / 60)::numeric, 1),
  ROUND(100.0 * COUNT(*) FILTER (WHERE
    ABS(EXTRACT(EPOCH FROM (
      (vp.reported AT TIME ZONE 'Europe/Guernsey')::time - sched.departure
    )) / 60) <= 2
  ) / NULLIF(COUNT(*),0)::numeric, 0)
FROM vehicle_positions vp
JOIN routes r ON r.id = vp.route_id
JOIN trips t  ON t.id = vp.trip_id
JOIN LATERAL (
  SELECT st.departure FROM stop_times st
  WHERE st.trip_id = t.id AND st.stop_id = vp.next_stop_id LIMIT 1
) sched ON true
WHERE vp.next_stop_id IS NOT NULL
GROUP BY r.line_name
ORDER BY
  CASE WHEN r.line_name ~ '^\d+$' THEN r.line_name::integer ELSE 999 END,
  r.line_name;" | \
awk -F"$SEP" 'NF==4 {
  delay = $3+0; ontime = $4+0
  status = (delay > 3) ? "LATE " : (delay < -1) ? "EARLY" : "OK   "
  bar = ""
  for(i=0; i<int(ontime/5); i++) bar = bar "█"
  for(i=int(ontime/5); i<20; i++) bar = bar "░"
  printf "  Route %-6s  %s  avg %+.1f min  on-time %3.0f%%  %s\n", $1, status, delay, ontime, bar
}'

# ── Occupancy ─────────────────────────────────────────────
echo ""
echo "[ OCCUPANCY — routes with data ]"
Q "
SELECT r.line_name,
  ROUND((AVG(vp.occupancy)*100)::numeric, 0)
FROM vehicle_positions vp
JOIN routes r ON r.id = vp.route_id
WHERE vp.occupancy IS NOT NULL
GROUP BY r.line_name
HAVING COUNT(*) > 2
ORDER BY AVG(vp.occupancy) DESC;" | \
awk -F"$SEP" 'NF==2 {
  pct = $2+0; filled = int(pct/5)
  bar = ""
  for(i=0; i<20; i++) bar = bar (i < filled ? "█" : "░")
  printf "  Route %-6s  %s  %d%%\n", $1, bar, pct
}'

echo ""
echo "======================================================"
echo ""
