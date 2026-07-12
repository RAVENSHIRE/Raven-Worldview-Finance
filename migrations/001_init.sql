-- Pre-Mover Systems · hybrid database schema
-- Target: PostgreSQL 15+ with the TimescaleDB extension.
-- Apply with:  psql "$DATABASE_URL" -f migrations/001_init.sql
-- TimescaleDB is optional: the hypertable conversion is guarded, so this
-- migration also runs on vanilla PostgreSQL (plain table, no compression).

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
-- CREATE EXTENSION IF NOT EXISTS timescaledb;  -- uncomment on a Timescale-enabled cluster

-- ─── ASSETS ──────────────────────────────────────────────────────────────────
-- One row per tracked instrument. Exchange and HQ coordinates power the
-- globe's primary-listing capital-flow arc (Exchange ──► HQ).
CREATE TABLE IF NOT EXISTS assets (
    ticker            TEXT PRIMARY KEY,
    company_name      TEXT NOT NULL,
    sector            TEXT,
    market_cap        NUMERIC(20, 2),
    portfolio_weight  NUMERIC(7, 4) DEFAULT 0 CHECK (portfolio_weight >= 0),
    exchange_name     TEXT,
    exchange_lat      DOUBLE PRECISION,
    exchange_lon      DOUBLE PRECISION,
    hq_country        TEXT,
    hq_lat            DOUBLE PRECISION,
    hq_lon            DOUBLE PRECISION,
    is_watchlisted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_watchlisted ON assets (is_watchlisted) WHERE is_watchlisted;
CREATE INDEX IF NOT EXISTS idx_assets_sector      ON assets (sector);

-- ─── PRICE SNAPSHOTS (time-series) ───────────────────────────────────────────
-- Append-only intraday/EOD price + volume captures. Converted to a
-- TimescaleDB hypertable when the extension is present.
CREATE TABLE IF NOT EXISTS price_snapshots (
    ticker        TEXT NOT NULL REFERENCES assets(ticker) ON DELETE CASCADE,
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    price         NUMERIC(18, 6) NOT NULL,
    change_1d_pct NUMERIC(9, 4),
    volume        BIGINT,
    market_cap    NUMERIC(20, 2),
    PRIMARY KEY (ticker, captured_at)
);

-- Guarded hypertable conversion: no-op without TimescaleDB.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable(
            'price_snapshots', 'captured_at',
            chunk_time_interval => INTERVAL '7 days',
            if_not_exists       => TRUE,
            migrate_data        => TRUE
        );
        -- Compress chunks older than 30 days (columnar storage per ticker)
        ALTER TABLE price_snapshots SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'ticker'
        );
        PERFORM add_compression_policy('price_snapshots', INTERVAL '30 days', if_not_exists => TRUE);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_price_snapshots_ticker_time
    ON price_snapshots (ticker, captured_at DESC);

-- ─── INTELLIGENCE REPORTS ────────────────────────────────────────────────────
-- Daily alpha output of the Perplexity worker (or fallback LLM). One report
-- per ticker per trading day; re-runs upsert on (ticker, report_date).
CREATE TABLE IF NOT EXISTS intelligence_reports (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker                        TEXT NOT NULL REFERENCES assets(ticker) ON DELETE CASCADE,
    report_date                   DATE NOT NULL DEFAULT CURRENT_DATE,
    catalyst_summary              TEXT,
    narrative_consensus_score     TEXT,                 -- e.g. 'UNDERVALUED / STRONG ACCUMULATION'
    information_asymmetry_rating  SMALLINT CHECK (information_asymmetry_rating BETWEEN 1 AND 10),
    -- Structured supply-chain web: top 3 suppliers + top 3 customers with
    -- best-effort HQ coordinates, e.g.
    -- [{"name":"TSMC","relation":"supplier","lat":24.77,"lon":120.99}, ...]
    supply_chain                  JSONB NOT NULL DEFAULT '[]'::jsonb,
    source                        TEXT NOT NULL DEFAULT 'perplexity'
                                  CHECK (source IN ('perplexity', 'fallback-llm', 'stub')),
    raw_response                  JSONB,                -- full provider payload for audit
    generated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ticker, report_date)
);

CREATE INDEX IF NOT EXISTS idx_intel_ticker_date ON intelligence_reports (ticker, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_intel_supply_gin  ON intelligence_reports USING GIN (supply_chain);

-- ─── DAILY MOVERS ────────────────────────────────────────────────────────────
-- Snapshot of the top-10 winners/losers isolated by the ingestion worker at
-- market close; the intel worker fans out from this list.
CREATE TABLE IF NOT EXISTS daily_movers (
    trade_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    ticker        TEXT NOT NULL,
    company_name  TEXT,
    direction     TEXT NOT NULL CHECK (direction IN ('winner', 'loser')),
    rank          SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 10),
    price         NUMERIC(18, 6),
    change_1d_pct NUMERIC(9, 4),
    volume        BIGINT,
    PRIMARY KEY (trade_date, direction, rank)
);

CREATE INDEX IF NOT EXISTS idx_movers_ticker ON daily_movers (ticker, trade_date DESC);

COMMIT;
