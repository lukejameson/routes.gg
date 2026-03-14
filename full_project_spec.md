# stops.gg — Guernsey Bus Journey Planner

## What It Does
A fast, offline-capable bus journey planner for Guernsey that serves both locals and visitors. Locals get power-user natural language search with saved preferences. Visitors get intuitive map-based selection, popular destinations, and landmark search. Fully client-cacheable with PWA support.

## Stack
Fixed: SvelteKit5|TS|PostgreSQL|Drizzle|Docker|PostGIS|MapLibre
Added: Node.js scraper, tsx, OpenFreeMap tiles, Fuse.js (fuzzy search)

## Features

### Core Journey Planning
1. Natural language query parsing with colloquial time expressions (now, tomorrow, 5pm, morning, next bus)
2. Direct journey search (no changes)
3. Single-change journey search
4. Two-change journey search
5. Day-aware scheduling with service calendars and exception dates
6. Flight mode (auto 60-min buffer for airport journeys)
7. Journey ranking by departure time, total duration, number of changes

### Location & Search
8. Fuzzy stop name matching
9. Postcode → nearest bus stop (spatial query against roads.gg data)
10. Road name → nearest bus stop (spatial query against roads.gg data)
11. Landmark/attraction → nearest bus stop
12. Current location (geolocation) → nearest bus stop
13. Stop disambiguation with map view when multiple matches
14. Search suggestions as user types

### Visitor Experience
15. Popular destinations quick-pick buttons (Airport, St Peter Port, beaches, attractions)
16. "To Airport" and "From Airport" quick-start buttons
17. Interactive map mode (tap to select origin/destination stops)
18. Visual journey results with route colors and stop markers

### Power User Features
19. Advanced search mode (dropdowns for stops, time picker, date picker)
20. Recent searches (localStorage, last 10)
21. Favorite stops (localStorage)
22. Favorite routes (localStorage)
23. Quick "reverse journey" button

### Journey Details
24. Journey detail page with full route visualization
25. All stops listed with times
26. Route map with MapLibre showing bus path
27. Transfer instructions for multi-change journeys
28. Alternative departure times for same route

### Offline & Performance
29. Full PWA with service worker
30. Cache all timetables, stops, routes for offline use
31. Cache map tiles for Guernsey area
32. Optimistic UI updates
33. Fast initial load (<2s)

## Data Model

### Table: stops
- id(text, pk), name(text, not null), canonical_name(text, not null), lat(decimal, not null), lng(decimal, not null), created_at(timestamp), updated_at(timestamp)
- Relations: referenced by stop_times, landmarks, popular_destinations
- Indexes: canonical_name, geography(lat,lng) using PostGIS

### Table: routes
- id(text, pk), line_name(text, not null), description(text), color(text), agency(text), created_at(timestamp), updated_at(timestamp)
- Relations: has many calendars
- Indexes: line_name

### Table: calendars
- id(serial, pk), route_id(text, fk:routes, not null), direction(text, not null), valid_from(date, not null), valid_to(date, not null), monday(boolean), tuesday(boolean), wednesday(boolean), thursday(boolean), friday(boolean), saturday(boolean), sunday(boolean), created_at(timestamp), updated_at(timestamp)
- Relations: belongs to route, has many trips and calendar_exceptions
- Indexes: route_id, valid_from, valid_to, composite(route_id, direction)

### Table: calendar_exceptions
- id(serial, pk), calendar_id(int, fk:calendars, not null), exception_date(date, not null), exception_type(text, not null)
- Relations: belongs to calendar
- Indexes: calendar_id, exception_date
- Note: exception_type is 'added' or 'removed'

### Table: trips
- id(serial, pk), calendar_id(int, fk:calendars, not null), headsign(text, not null), created_at(timestamp)
- Relations: belongs to calendar, has many stop_times
- Indexes: calendar_id

### Table: stop_times
- id(serial, pk), trip_id(int, fk:trips, not null), stop_id(text, fk:stops, not null), stop_sequence(int, not null), arrival_time(text, not null), departure_time(text, not null)
- Relations: belongs to trip, references stop
- Indexes: trip_id, stop_id, composite(trip_id, stop_sequence)
- Note: times are HH:MM format, may exceed 24:00 for next-day services

### Table: landmarks
- id(serial, pk), name(text, not null), category(text, not null), lat(decimal, not null), lng(decimal, not null), nearest_stop_id(text, fk:stops), created_at(timestamp)
- Relations: references stop
- Indexes: name, category, geography(lat,lng)
- Categories: attraction, beach, hotel, restaurant, historic, government, school, hospital

### Table: popular_destinations
- id(serial, pk), name(text, not null), type(text, not null), stop_id(text, fk:stops, not null), display_order(int, not null), icon(text), created_at(timestamp)
- Relations: references stop
- Indexes: display_order
- Types: airport, town, beach, attraction, transport

### Table: scrape_metadata
- id(serial, pk), scraped_at(timestamp, not null), total_routes(int), total_stops(int), total_trips(int), agency(text), status(text)
- Relations: none
- Indexes: scraped_at desc

### Roads.gg Database Access (read-only)
- roads.postcodes(code, lat, lng, ...)
- roads.road_names(name, lat, lng, ...)

## API Endpoints

### Stops & Routes
GET /api/stops - list all stops, auth:none, params:search(optional,fuzzy), lat/lng(optional,for nearby)
GET /api/stops/[id] - get single stop with next departures, auth:none
GET /api/routes - list all routes with colors, auth:none
GET /api/routes/[id] - get route details with calendars, auth:none, params:include_trips(optional)

### Search & Journey Planning
POST /api/search - natural language journey search, auth:none, body:{query,date,time,flightMode}
POST /api/journey - structured journey search, auth:none, body:{origin,destination,date,time,arriveBy,maxChanges,flightMode}
GET /api/journey/[id] - get journey details with full route, auth:none

### Location Services
POST /api/location/nearest - find nearest stop to coordinates, auth:none, body:{lat,lng,limit}
GET /api/location/postcode/[code] - get stops near postcode, auth:none
GET /api/location/road/[name] - get stops near road, auth:none
GET /api/landmarks - list all landmarks, auth:none, params:category(optional)
GET /api/landmarks/search - search landmarks, auth:none, params:q(required)

### Popular Destinations
GET /api/destinations - list popular destinations ordered, auth:none

### Utility
GET /api/health - health check with db status and last scrape, auth:none
GET /api/scrape/status - get last scrape metadata, auth:none

## Pages & Routes

/ - homepage with search interface, quick picks, map toggle, minimal layout, auth:none

/search - journey results page, shows multiple journey options, auth:none

/journey/[id] - journey detail page with full route map and stops, auth:none

/stops - browse all stops (list + map view), auth:none

/stops/[id] - stop detail page with timetable and nearby stops, auth:none

/routes - browse all routes, auth:none

/routes/[id] - route detail page with full timetable, auth:none

/map - full-screen interactive map for stop selection, auth:none

/favorites - saved stops and routes, auth:none

/about - about page with data sources and credits, auth:none

## Key Components

### Search Components
SearchBar: natural language input with autocomplete, props:{initialQuery,onSearch,flightMode}
QuickPicks: popular destination buttons, props:{destinations,onSelect}
AirportButtons: to/from airport shortcuts, props:{onSelect}
AdvancedSearch: dropdown selectors and time pickers, props:{onSearch}
SearchSuggestions: autocomplete dropdown with stops/landmarks/roads, props:{query,results,onSelect}

### Journey Components
JourneyCard: single journey result card, props:{journey,onClick}
JourneyList: list of journey options, props:{journeys,onSelect}
JourneyDetail: full journey visualization with map, props:{journey}
LegCard: single journey leg with route and times, props:{leg,isTransfer}
TransferInstructions: walking/waiting instructions between legs, props:{from,to,duration}

### Map Components
MapView: MapLibre map container, props:{center,zoom,stops,routes,interactive}
StopMarker: map marker for bus stop, props:{stop,onClick,isSelected}
RouteLayer: polyline showing bus route, props:{route,color}
UserLocationMarker: current location indicator, props:{lat,lng}

### Location Components
LocationPicker: button to use current location, props:{onLocation}
NearbyStops: list of stops near location, props:{stops,distance,onSelect}
StopDisambiguation: map view when multiple stops match, props:{stops,onSelect}

### Utility Components
TimeDisplay: formatted time with relative display, props:{time,showRelative}
RouteBadge: colored route number badge, props:{routeNumber,color}
DayGrid: visual calendar showing service days, props:{serviceDays}
FavoriteButton: star icon to save stop/route, props:{itemId,type,isFavorite,onToggle}
RecentSearches: list of recent queries, props:{searches,onSelect,onClear}

## Auth Strategy

None. All data is public. LocalStorage used for:
- Recent searches (array of query objects, max 10)
- Favorite stops (array of stop IDs)
- Favorite routes (array of route IDs)
- User preferences (theme, map style, default search mode)

## External Integrations

**Ticketless UrbanThings API**
- Endpoint: https://ticketless-app.api.urbanthings.cloud/api/2/...
- Auth: x-api-key: TIzVfvPTlb5bjo69rsOPbabDVhwwgSiLaV5MCiME, x-ut-app: travel.ticketless.app.guernsey;platform=web
- Operations: fetch timetables (scraper only, weekly cron)
- Rate limits: unknown, scraper runs weekly so low impact

**OpenFreeMap**
- Endpoint: https://tiles.openfreemap.org/styles/liberty
- Auth: none required
- Operations: map tile rendering via MapLibre GL JS
- Cache: tiles cached by service worker for offline use

**Geolocation API**
- Browser native API for current location
- Requires HTTPS and user permission
- Fallback: manual location entry if denied

## Environment Variables

DATABASE_URL: postgresql connection string for stops.gg database
ROADS_DATABASE_URL: postgresql connection string for roads.gg database (read-only)
URBANTHINGS_API_KEY: TIzVfvPTlb5bjo69rsOPbabDVhwwgSiLaV5MCiME
URBANTHINGS_APP_ID: travel.ticketless.app.guernsey;platform=web
PUBLIC_MAPLIBRE_STYLE: https://tiles.openfreemap.org/styles/liberty
PUBLIC_APP_URL: https://stops.gg

## Docker Setup

Single docker-compose.yml for all environments:

Services:
- stops-web: SvelteKit app (Node adapter), port 3000
- stops-scraper: Node.js scraper (cron schedule: weekly Sunday 3am)

External dependencies (already exist on VPS):
- PostgreSQL with PostGIS extension
- Traefik reverse proxy with auto-TLS
- Redis (if needed for caching)

Volumes:
- stops-data: persistent storage for scraper logs

Networks:
- web: Traefik network for reverse proxy
- internal: app-to-db communication

## Natural Language Parser

**File**: src/lib/search/parser.ts

Parse patterns:
- Origin/destination: "from X to Y", "X to Y", "to Y from X"
- Time: "at 5pm", "at 17:00", "now", "in 30 mins", "tomorrow at 9am"
- Day: "tomorrow", "monday", "next tuesday"
- Intent: "next bus", "first bus", "last bus", "arrive by 6pm"
- Flight mode: "to airport", "from airport" (auto-enables 60min buffer)

Fuzzy matching with Fuse.js:
- Match stop names with threshold 0.3
- Match landmarks/attractions
- Match road names and postcodes
- Return confidence score with results

## Journey Search Algorithm

**File**: src/lib/search/journey.ts

Cascading search strategy:
1. Direct journeys: find all trips that serve both stops in sequence
2. Single-change: find trips connecting at intermediate stop
3. Two-change: find trips with two intermediate transfer stops

Constraints:
- Minimum transfer time: 5 minutes
- Maximum transfer time: 30 minutes
- Maximum walking distance for transfers: 500m
- Day-aware: respect service calendars and exception dates
- Time-aware: filter by departure/arrival time

Ranking:
1. Fewest changes (direct > 1-change > 2-change)
2. Earliest departure (or latest arrival if arriveBy mode)
3. Shortest total duration
4. Prefer routes with higher frequency

## Service Worker Strategy

**File**: src/service-worker.ts

Cache strategy:
- App shell: cache-first (HTML, CSS, JS)
- API data: network-first with fallback to cache (stops, routes, timetables)
- Map tiles: cache-first with expiry (7 days)
- Static assets: cache-first (images, fonts)

Offline behavior:
- Show cached journey results with "Offline" indicator
- Allow search using cached data
- Queue failed requests for retry when online
- Show last update timestamp

Cache size limits:
- Timetable data: ~5MB
- Map tiles (Guernsey area): ~50MB
- App shell: ~2MB

## Scraper Implementation

**File**: scraper/index.ts

Workflow:
1. Fetch timetable data from UrbanThings API for all routes
2. Parse JSON structure matching timetables.json format
3. Begin transaction
4. Upsert stops (deduplicate by id, calculate canonical_name)
5. Upsert routes with colors
6. Insert calendars with service days and date ranges
7. Insert calendar_exceptions (additionalDates='added', excludedDates='removed')
8. Insert trips with headsigns
9. Insert stop_times with sequence
10. Insert scrape_metadata record
11. Commit transaction
12. Log summary stats

Error handling:
- Rollback on failure
- Log to stdout and file
- Exit with code 1 on error
- Retry logic for API failures (3 attempts)

Idempotency:
- Upsert stops/routes by id
- Delete existing calendars/trips for route before insert
- Running multiple times produces same result

## Landmarks Seeding

**File**: scraper/seed-landmarks.ts

Manually curated list of Guernsey landmarks:
- Attractions: Castle Cornet, Hauteville House, Fort Grey, La Vallette Underground Military Museum
- Beaches: Cobo Bay, Vazon Bay, Petit Bot, Fermain Bay, Pembroke Bay
- Hotels: Old Government House Hotel, Duke of Richmond Hotel, St Pierre Park
- Historic: German Occupation Museum, Little Chapel, Sausmarez Manor
- Government: States Building, Beau Sejour, Princess Royal Centre
- Transport: Airport, Harbour

For each landmark:
1. Geocode address to lat/lng (manual entry or API)
2. Find nearest stop using PostGIS distance query
3. Insert into landmarks table
4. Verify accuracy with manual checks

## Popular Destinations Seeding

**File**: scraper/seed-destinations.ts

Curated list with display order:
1. Airport (type: airport, icon: plane)
2. St Peter Port / Town (type: town, icon: building)
3. St Sampson (type: town, icon: building)
4. Cobo Bay (type: beach, icon: umbrella)
5. Vazon Bay (type: beach, icon: umbrella)
6. Beau Sejour (type: attraction, icon: activity)
7. Princess Royal Hospital (type: transport, icon: hospital)
8. Harbour (type: transport, icon: anchor)

Each entry maps to primary stop serving that destination.

## PostGIS Spatial Queries

Enable extension:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
Add geography column to stops:ALTER TABLE stops ADD COLUMN geog geography(POINT, 4326);
UPDATE stops SET geog = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
CREATE INDEX stops_geog_idx ON stops USING GIST(geog);
Nearest stop query:SELECT id, name, ST_Distance(geog, ST_SetSRID(ST_MakePoint($$lng, $$lat), 4326)::geography) as distance
FROM stops
ORDER BY geog <-> ST_SetSRID(ST_MakePoint($$lng, $$lat), 4326)::geography
LIMIT 5;
Stops within radius:SELECT * FROM stops
WHERE ST_DWithin(geog, ST_SetSRID(ST_MakePoint($$lng, $$lat), 4326)::geography, 500);
MapLibre ConfigurationFile: src/lib/map/config.tsStyle URL: https://tiles.openfreemap.org/styles/libertyCustom layers:
Bus stops: circle markers with route colors
Routes: line strings with route colors and direction arrows
User location: pulsing blue dot
Selected stops: larger markers with labels
Bounds: Guernsey bounding box
North: 49.73, South: 49.40, East: -2.49, West: -2.67
Default center: St Peter Port (49.4567, -2.5364)
Default zoom: 12Interaction:
Click stop marker → show popup with stop name and routes
Click map → select origin/destination in map mode
Drag to pan, scroll to zoom
Mobile: touch gestures
Special Notes
Time format: HH:MM strings may exceed 24:00 for next-day services (e.g. "25:30" = 1:30am next day)
Stop canonical names: merge directional variants ("Town Church, Opp" → "Town Church")
Transfer walking time: assume 5 mins minimum, calculate from distance if stops >100m apart
Flight mode: subtract 60 mins from departure time when destination is airport
Service calendar logic: check day of week AND valid date range AND exception dates
Map tile caching: pre-cache Guernsey area tiles on first load for offline use
Roads.gg integration: use separate read-only connection pool to avoid lock contention
Performance: index all foreign keys, use composite indexes for common queries
Mobile UX: large touch targets (min 44px), bottom sheet for results, sticky search bar
Accessibility: ARIA labels, keyboard navigation, screen reader support
Analytics: consider privacy-friendly analytics (Plausible/Umami) in future phase
Error messages: user-friendly with suggestions ("No buses found. Try searching for a nearby stop.")
Empty states: show helpful prompts when no favorites/recent searches
Loading states: skeleton screens for journey results, shimmer effect
Validation: check date/time inputs, prevent past dates, handle timezone (GMT/BST)
Future Phases (Not in MVP)Phase 2:
Live bus tracking via UrbanThings vehiclepositions API
Real-time delay notifications
Push notifications for favorite routes
Phase 3:
Travel time estimation using roads.gg road network data
Multi-modal routing (bus + walking)
Route optimization based on historical data
User-submitted stop ratings and photos
Success Criteria
Fast initial load (<2s on 3G)
Works fully offline after first visit
Natural language search accuracy >90% for common queries
Journey results returned in <500ms
Mobile responsive on all screen sizes
Accessible (WCAG 2.1 AA)
No runtime errors in production
Scraper runs reliably weekly
Map loads in <1s
PWA installable on mobile devices
