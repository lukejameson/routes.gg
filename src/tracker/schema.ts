export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS stops (
  id         SERIAL PRIMARY KEY,
  stop_ref   TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
  id              SERIAL PRIMARY KEY,
  route_ref       TEXT NOT NULL UNIQUE,
  line_name       TEXT NOT NULL,
  line_name_norm  TEXT NOT NULL,
  description     TEXT,
  color           TEXT,
  agency_id       TEXT NOT NULL DEFAULT 'TCKTLSS_OP_GUERNSEY'
);
CREATE INDEX IF NOT EXISTS idx_routes_norm ON routes(line_name_norm);

CREATE TABLE IF NOT EXISTS calendars (
  id          SERIAL PRIMARY KEY,
  route_id    INTEGER NOT NULL REFERENCES routes(id),
  direction   TEXT NOT NULL,
  valid_from  DATE NOT NULL,
  valid_to    DATE NOT NULL,
  mon         BOOLEAN NOT NULL DEFAULT false,
  tue         BOOLEAN NOT NULL DEFAULT false,
  wed         BOOLEAN NOT NULL DEFAULT false,
  thu         BOOLEAN NOT NULL DEFAULT false,
  fri         BOOLEAN NOT NULL DEFAULT false,
  sat         BOOLEAN NOT NULL DEFAULT false,
  sun         BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(route_id, direction, valid_from, valid_to)
);

CREATE TABLE IF NOT EXISTS calendar_exceptions (
  id             SERIAL PRIMARY KEY,
  calendar_id    INTEGER NOT NULL REFERENCES calendars(id),
  exception_date DATE NOT NULL,
  exception_type TEXT NOT NULL,
  UNIQUE(calendar_id, exception_date, exception_type)
);

CREATE TABLE IF NOT EXISTS trips (
  id               SERIAL PRIMARY KEY,
  calendar_id      INTEGER NOT NULL REFERENCES calendars(id),
  headsign         TEXT,
  first_departure  TIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_calendar ON trips(calendar_id);

CREATE TABLE IF NOT EXISTS stop_times (
  id          SERIAL PRIMARY KEY,
  trip_id     INTEGER NOT NULL REFERENCES trips(id),
  stop_id     INTEGER NOT NULL REFERENCES stops(id),
  seq         SMALLINT NOT NULL,
  arrival     TIME NOT NULL,
  departure   TIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_st_trip ON stop_times(trip_id, seq);
CREATE INDEX IF NOT EXISTS idx_st_stop ON stop_times(stop_id);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id           SERIAL PRIMARY KEY,
  scraped_at   TIMESTAMPTZ NOT NULL,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_routes INTEGER,
  agency_id    TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_positions (
  id              BIGSERIAL PRIMARY KEY,
  ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vehicle_ref     TEXT NOT NULL,
  route_id        INTEGER REFERENCES routes(id),
  trip_id         INTEGER REFERENCES trips(id),
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  bearing         SMALLINT,
  next_stop_id    INTEGER REFERENCES stops(id),
  occupancy       REAL,
  direction       SMALLINT,
  reported        TIMESTAMPTZ NOT NULL,
  raw_route_name  TEXT,
  api_route_id    TEXT,
  api_trip_id     TEXT,
  destination     TEXT,
  current_stop_id INTEGER REFERENCES stops(id),
  vehicle_id      TEXT,
  UNIQUE(vehicle_ref, reported)
);
CREATE INDEX IF NOT EXISTS idx_vp_ts       ON vehicle_positions(ts DESC);
CREATE INDEX IF NOT EXISTS idx_vp_vehicle  ON vehicle_positions(vehicle_ref, ts DESC);
CREATE INDEX IF NOT EXISTS idx_vp_route    ON vehicle_positions(route_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_vp_trip     ON vehicle_positions(trip_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_vp_reported ON vehicle_positions(reported DESC);
`;

export const MIGRATE_SQL = `
ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS raw_route_name  TEXT;
ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS api_route_id    TEXT;
ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS api_trip_id     TEXT;
ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS destination     TEXT;
ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS current_stop_id INTEGER REFERENCES stops(id);
ALTER TABLE vehicle_positions ADD COLUMN IF NOT EXISTS vehicle_id      TEXT;
DO $$ BEGIN
  ALTER TABLE calendars DROP CONSTRAINT calendars_route_id_direction_valid_from_valid_to_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
`;
