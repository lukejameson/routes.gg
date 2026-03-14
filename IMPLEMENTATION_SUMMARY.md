# Traffic Congestion Analysis Implementation Summary

## What Was Implemented

### New Endpoint: `GET /api/congestion`

Added to `dashboard/server.js` to analyze traffic congestion hotspots using bus GPS location data.

## Key Features

### 1. **Speed Segment Calculation**
- Reuses the Haversine formula from `/api/speeds` endpoint
- Filters consecutive GPS pings with 20–40 second gaps
- Converts distance to mph using factor 2.237
- Filters out unrealistic speeds (>35 mph for buses)

### 2. **Geo-Cell Grid Assignment**
- Assigns each segment to a 4-decimal-degree grid cell
- Resolution: ±11 meters per cell
- Aggregates by cell midpoint between consecutive positions

### 3. **Historical Baseline Comparison**
- Queries past 4 weeks (configurable) of data
- Filters to same hour of day for time-of-day normalization
- Requires minimum 5 observations per cell (cold-start protection)
- Aggregates baseline speeds per grid cell

### 4. **Congestion Scoring**
- Formula: `(baseline_speed - current_speed) / baseline_speed`
- Range: 0 (no congestion) to 1 (complete standstill)
- Example: score of 0.78 = 78% slower than historical average

### 5. **Multi-Route Corroboration**
- Counts distinct vehicles and routes per cell
- Returns route names confirming the slowdown
- Higher route count = higher confidence in congestion signal

### 6. **Response Format**
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

## Query Parameters

| Parameter | Type | Default | Example |
|-----------|------|---------|---------|
| `preset` | string | none | `today`, `yesterday`, `last24h`, `last7d` |
| `from` / `to` | ISO8601 | none | `2026-03-13T08:00:00Z` |
| `timeFrom` / `timeTo` | HH:MM | none | `08:00`, `09:00` |
| `days` | string | none | `1,2,3,4,5` (Mon-Fri) |
| `window` | int | 30 | Analysis window in minutes |
| `baselineWeeks` | int | 4 | Historical period in weeks |
| `threshold` | float | 0.3 | Minimum score (0-1) to report |

## Testing

### Basic Call
```bash
curl http://localhost:3000/api/congestion
```

### Morning Rush (08:00-09:00 today)
```bash
curl "http://localhost:3000/api/congestion?preset=today&timeFrom=08:00&timeTo=09:00"
```

### Strict Threshold (only >50% slowdown)
```bash
curl "http://localhost:3000/api/congestion?threshold=0.5"
```

### Weekday Pattern
```bash
curl "http://localhost:3000/api/congestion?preset=thisWeek&days=1,2,3,4,5"
```

## Technical Highlights

### Database Efficiency
- Uses CTEs for modularity and readability
- Haversine calculation inlined (no UDF overhead)
- Parameterized query to prevent SQL injection
- INTERVAL interpolation for time windows

### Time Normalization
- Baseline filtered to same hour as query time
- Timezone-aware using 'Europe/Guernsey'
- Handles day-of-week filtering for pattern matching

### Robustness
- Minimum 5 baseline samples per cell (avoids noise)
- Speed filtering (10m > distance > 35 mph) removes outliers
- Cold-baseline cells excluded from results
- NULL-safe division with NULLIF

## Known Limitations

1. **Coverage**: Only detects congestion on roads with bus service
2. **Stop Dwell**: Long stops may appear as slowdowns (can use bearing + stop_id to filter)
3. **Baseline Quality**: First 4 weeks of operation may have sparse baselines
4. **Weather/Events**: Unusual events (accidents, closures) not distinguished from traffic
5. **Guernsey-Specific**: 24 routes = good coverage of major corridors, less on side streets

## Integration

The endpoint reuses:
- `buildDateFilter()` for date/time parameter handling
- `convertNumeric()` for proper numeric type conversion
- `pool` database connection
- Haversine formula pattern from `/api/speeds`

No new dependencies or external libraries required.

## Next Steps (Optional)

- **Dashboard Visualization**: Leaflet.js heatmap overlay in `public/` (out of scope)
- **Real-time Alerting**: Threshold-based notifications (out of scope)
- **Mobile App Integration**: Consume /api/congestion for user-facing features (out of scope)
- **Performance Indexing**: Add BRIN index on `vehicle_positions(reported)` if needed

## Files Modified

- `dashboard/server.js` — Added `/api/congestion` endpoint (~120 lines)

## Files Created

- `docs/congestion-endpoint.md` — Complete endpoint documentation
- `IMPLEMENTATION_SUMMARY.md` — This file
