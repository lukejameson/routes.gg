# Stops.gg Dashboard

A simple HTML/JS dashboard for visualizing transit data from Stops.gg.

## Setup

1. **Copy the environment file:**
   ```bash
   cp dashboard/.env.example dashboard/.env
   ```

2. **Update the database connection in `dashboard/.env`:**
   ```
   DATABASE_URL=postgresql://user:password@db:5432/stopsgg
   ```

3. **Run with Docker:**
   ```bash
   docker-compose up dashboard
   ```

4. **Access the dashboard:**
   Open http://localhost:5173 in your browser

## Features

- **Overview**: KPIs, live map, punctuality and occupancy charts
- **Fleet**: Real-time vehicle positions with filtering
- **Punctuality**: Delay analysis by route and hour
- **Occupancy**: Route occupancy levels and distribution
- **Stops**: Stop popularity and dwell time analysis
- **Issues**: Bus bunching alerts, delay hotspots, route hoppers

## Auto-refresh

Data refreshes automatically every 30 seconds.

## Drill-down

Click on any vehicle, route, or stop to see detailed information.
