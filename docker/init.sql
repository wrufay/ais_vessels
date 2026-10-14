CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE TABLE ais_positions (
    mmsi        BIGINT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    latitude    REAL,
    longitude   REAL,
    speed       REAL,
    course      REAL,
    heading     REAL,
    source      TEXT
);

SELECT create_hypertable('ais_positions', 'received_at',
    chunk_time_interval => INTERVAL '1 month');

CREATE TABLE vessels (
    mmsi      BIGINT PRIMARY KEY,
    name      TEXT,
    ship_type INTEGER,
    callsign  TEXT,
    imo       BIGINT
);

-- Tracks which CSV files have been ingested (for resumable pipeline runs)
CREATE TABLE ingestion_log (
    filename    TEXT PRIMARY KEY,
    rows_loaded BIGINT,
    loaded_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Submissions from the app's Feedback panel, reviewed on /feedback-inbox.
-- main.py also creates this on startup (for databases created before it).
CREATE TABLE IF NOT EXISTS feedback (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category    TEXT NOT NULL CHECK (category IN ('issue', 'feature', 'other')),
    message     TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
    email       TEXT,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add this index AFTER bulk load, not before:
-- CREATE INDEX ON ais_positions (mmsi, received_at DESC);
