# Congestion Map Visualization

## Overview

The dashboard now includes an interactive map visualization for traffic congestion hotspots. Access it via the **Congestion** tab in the navigation menu.

## Features

### Map Visualization
- **Interactive Leaflet.js map** showing real-time congestion hotspots
- **Color-coded circles** indicating congestion severity:
  - 🔴 **Red**: Severe congestion (>70% slower than baseline)
  - 🟠 **Orange**: Moderate congestion (40-70% slower)
  - 🟡 **Yellow**: Light congestion (20-40% slower)
- **Circle size** represents the number of vehicles confirming the slowdown
- **Click popups** show detailed information:
  - Current and baseline speeds
  - Vehicle and route count
  - Routes affected
  - Baseline sample size (confidence indicator)

### Interactive Controls

#### Score Threshold
- **Range**: 0.0 to 1.0
- **Default**: 0.3
- **Function**: Only display hotspots with congestion score above this threshold
- **Example**: Set to 0.5 to show only moderate-to-severe congestion

#### Window (Minutes)
- **Range**: 10-240 minutes
- **Default**: 30
- **Function**: Time window for current speed analysis
- **Example**: Use 60 to analyze the last hour

#### Baseline (Weeks)
- **Range**: 1-12 weeks
- **Default**: 4
- **Function**: Historical period to compare against
- **Example**: Use 2 for more recent baselines (less stable) or 8 for long-term trends

### Data Table

Below the map is a detailed table showing top 20 hotspots with:
- **Location**: 4-decimal-degree grid coordinates (±11m resolution)
- **Current Speed**: Observed average speed (mph)
- **Baseline Speed**: Historical average (mph)
- **Congestion Score**: Percentage slower than normal (0-100%)
- **Vehicles**: Distinct vehicles confirming the slowdown
- **Routes**: Distinct routes confirming the slowdown
- **Confidence**: Based on baseline sample size
  - **High**: 10+ samples
  - **Medium**: 5-10 samples
  - **Low**: <5 samples

### Summary Statistics

At the bottom:
- **Total Hotspots**: Number of congestion hotspots detected
- **Average Score**: Average congestion severity across all hotspots
- **Last Updated**: Timestamp of the most recent data fetch

## Usage Examples

### Real-Time Monitoring
1. Open the **Congestion** tab
2. Default settings show recent 30-min window against 4-week baseline
3. Circles update every refresh (default 30 seconds)
4. Click circles to see detailed information

### Morning Rush Analysis
1. Set **Threshold**: 0.4 (show moderate+ congestion)
2. Set **Window**: 60 (analyze full hour)
3. Apply global **From Time**: 08:00, **To Time**: 09:00
4. Click **Refresh Congestion** to update
5. Identify typical rush-hour bottlenecks

### Baseline Comparison
- **Strict baseline** (8 weeks): See long-term patterns
- **Loose baseline** (2 weeks): See recent trend changes

### High-Confidence Alerts
1. Set **Threshold**: 0.5 (only severe congestion)
2. Focus on hotspots with "High" confidence (10+ samples)
3. Multi-route confirmation (Routes > 1) increases reliability

## Technical Details

### Data Refresh
- Automatic refresh: Every 30 seconds (same as global refresh)
- Manual refresh: Click "Refresh Congestion" button
- Data is filtered by global filter settings (dates, times, days of week)

### Map Interaction
- **Pan**: Click and drag
- **Zoom**: Scroll wheel or +/- buttons
- **Info**: Click a circle to see popup with details

### Color Scale

| Score | Color | Severity |
|-------|-------|----------|
| 0.0 - 0.2 | — | Not shown |
| 0.2 - 0.4 | 🟡 Yellow | Light |
| 0.4 - 0.7 | 🟠 Orange | Moderate |
| 0.7 - 1.0 | 🔴 Red | Severe |

### Performance Notes
- Map renders 50 hotspots maximum
- Slider adjustments update statistics instantly
- API query typically <500ms for 30-min window
- Works best with current data (avoid very old date ranges)

## Troubleshooting

### No hotspots showing
- Lower the **Threshold** (currently too strict)
- Widen the **Window** (more data points)
- Check that buses were operating during the selected time period
- Verify global date/time filters are reasonable

### Low confidence readings
- Increase **Baseline** weeks (more historical data)
- Look for hotspots with "High" confidence instead
- Multi-route confirmation is more reliable than single-route slowdowns

### Map not updating
- Click "Refresh Congestion" button manually
- Check browser console for errors (F12)
- Ensure API is running (`npm start` in dashboard directory)

## Integration with Other Views

- **Punctuality**: Compare congestion hotspots with delay zones
- **Speeds**: Confirms slowest routes match congestion map
- **Issues**: Geo-delays map uses similar visualization (uses delay not congestion)

## Future Enhancements (Out of Scope)

- Heatmap layer (currently circles)
- Time-series animation showing congestion over hours
- Integration with incident data (accidents, road works)
- Predictive congestion forecasting
- Export reports with congestion analysis
- Mobile app integration

## Related Endpoints

- `GET /api/congestion` — Main congestion analysis API
- `GET /api/speeds` — Raw vehicle speed data
- `GET /api/geo-delays` — Schedule delay hotspots (different metric)
