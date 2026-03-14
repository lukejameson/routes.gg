# Traffic Congestion Analysis Endpoint

## Overview

The `/api/congestion` endpoint analyzes real-time bus location data to identify traffic congestion hotspots using speed comparisons against historical baselines.

## Endpoint

```
GET /api/congestion
```

## Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `preset` | string | none | Preset date range: `today`, `yesterday`, `last24h`, `last7d`, `thisWeek`, `lastWeek`, `thisMonth` |
| `from` | ISO8601 | none | Start date (e.g., `2026-03-13T00:00:00Z`) |
| `to` | ISO8601 | none | End date (e.g., `2026-03-13T23:59:59Z`) |
| `timeFrom` | HH:MM | none | Time-of-day start (e.g., `08:00`) |
| `timeTo` | HH:MM | none | Time-of-day end (e.g., `09:00`) |
| `days` | string | none | Day-of-week filter (0=Sun, 1=Mon, ..., 6=Sat), comma-separated |
| `window` | int | 30 | Analysis window in minutes (default 30) |
| `baselineWeeks` | int | 4 | Historical baseline period in weeks (default 4) |
| `threshold` | float | 0.3 | Minimum congestion score to report (0-1 scale) |

## Response

```json
{
  "generated_at": "2026-03-13T09:15:00Z",
  "window_minutes": 30,
  "baseline_weeks": 4,
  "score_threshold": 0.3,
  "hotspots": [
    {
      "lat": 49.4567,
      "lng": -2.5432,
      "current_speed_mph": 4.2,
      "baseline_speed_mph": 18.7,
      "congestion_score": 0.78,
      "vehicle_count": 3,
      "route_count": 2,
      "routes": "11, 91",
      "baseline_samples": 42
    }
  ],
  "summary": {
    "total_hotspots": 7,
    "avg_congestion_score": 0.48,
    "timestamp": "2026-03-13T09:15:00Z"
  }
}
```

### Response Fields

- **lat / lng** — 4-decimal-degree grid cell centroid (±11m resolution)
- **current_speed_mph** — Average observed speed in this cell (last 30 min)
- **baseline_speed_mph** — Historical average speed (same hour, past 4 weeks)
- **congestion_score** — `(baseline_speed - current_speed) / baseline_speed`, clamped 0–1
  - `0.0` = no congestion, speeds match baseline
  - `1.0` = complete congestion, speed near zero
  - `0.78` = 78% slower than normal
- **vehicle_count** — Distinct vehicles observed in this cell (last window)
- **route_count** — Distinct routes observed in this cell (higher = more corroboration)
- **routes** — Comma-separated route names confirming the slowdown
- **baseline_samples** — Number of historical observations used for baseline (≥5 required)

## Examples

### Real-time congestion (last 30 min, default baseline)

```bash
curl "http://localhost:3000/api/congestion"
```

### Morning rush hour (08:00-09:00 today)

```bash
curl "http://localhost:3000/api/congestion?preset=today&timeFrom=08:00&timeTo=09:00"
```

### Stricter threshold (only major congestion > 50% slowdown)

```bash
curl "http://localhost:3000/api/congestion?threshold=0.5"
```

### Custom baseline (2 weeks instead of 4)

```bash
curl "http://localhost:3000/api/congestion?baselineWeeks=2"
```

### Wider observation window (60 min instead of 30)

```bash
curl "http://localhost:3000/api/congestion?window=60"
```

### Weekday pattern (Mon-Fri only)

```bash
curl "http://localhost:3000/api/congestion?preset=thisWeek&days=1,2,3,4,5"
```

## Technical Details

### Algorithm

1. **Segment calculation**: For each vehicle, consecutive GPS pings with 20–40s gap
2. **Distance & speed**: Haversine formula converts lat/lng pairs to meters, then to mph
3. **Grid cell assignment**: Round midpoint to 4 decimal places (±11m resolution)
4. **Baseline**: Query same time-of-day from past N weeks, aggregate by grid cell
5. **Scoring**: `(baseline_speed - current_speed) / baseline_speed`, clamped to [0, 1]
6. **Corroboration**: Count distinct vehicles and routes per cell (higher = higher confidence)
7. **Filtering**: Return cells with score ≥ threshold, ranked by score DESC

### Limitations

- **Coverage gaps**: If no bus travelled a road in the past 30 min, it won't appear
- **Cold baseline**: Cells with <5 historical observations are excluded
- **Unusual slowdowns**: Bus stops, breakdowns, or accidents may inflate scores
  - Use **bearing** + **current_stop_id** proximity to filter out stop dwell
- **Edge cases**: Direction changes (e.g., turnarounds) may produce false slowdowns
  - Baseline filter helps; bearings can validate direction consistency

### Performance

- Query typically completes in <500ms for 30-min window over 4-week baseline
- Indexes on `vehicle_positions(vehicle_ref, reported)` and `routes(id)` recommended
- HNSW geospatial indexing not required for grid-based lookup

## Visualization (Optional)

Output can be rendered as a Leaflet.js heatmap overlay in the dashboard:

```javascript
// Pseudocode for frontend integration
fetch('/api/congestion')
  .then(r => r.json())
  .then(data => {
    data.hotspots.forEach(spot => {
      L.circleMarker([spot.lat, spot.lng], {
        radius: 10,
        fillOpacity: spot.congestion_score,
        color: `hsl(0, 100%, ${50 + spot.congestion_score * 50}%)`,
        popup: `${spot.routes}: ${spot.congestion_score.toFixed(2)}`
      }).addTo(map);
    });
  });
```

## Related Endpoints

- `GET /api/speeds` — Individual vehicle speed segments (detailed)
- `GET /api/geo-delays` — Schedule delay hotspots (not congestion-specific)
- `GET /api/punctuality` — Route-level on-time performance
- `GET /api/stops` — Stop-level activity and dwell patterns
