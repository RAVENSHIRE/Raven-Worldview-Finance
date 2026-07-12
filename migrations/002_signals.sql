-- Pre-Mover Systems · multi-signal ingestion layer
-- Raw inbound signals (screeners, 13F/SEC filings, Twitter/X, Substack,
-- YouTube transcripts, IR emails) and the structured catalysts the AI
-- extraction engine derives from them.

BEGIN;

-- Raw payloads land here first (append-only audit trail). Large documents
-- (13F/10-K) store an excerpt; full text lives in object storage if needed.
CREATE TABLE IF NOT EXISTS raw_signals (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type  TEXT NOT NULL CHECK (source_type IN
                 ('screener', '13f', 'sec-filing', 'twitter', 'substack', 'youtube', 'email', 'other')),
    source_ref   TEXT,                         -- URL, accession number, tweet id…
    payload      TEXT NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_raw_signals_unprocessed
    ON raw_signals (received_at) WHERE processed_at IS NULL;

-- Structured output of the AI extraction engine, one row per detected
-- ticker-catalyst. This is the feed the globe + signal pages render.
CREATE TABLE IF NOT EXISTS asymmetric_signals (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_signal_id                 UUID REFERENCES raw_signals(id) ON DELETE SET NULL,
    ticker                        TEXT NOT NULL,
    source_type                   TEXT NOT NULL,
    catalyst_core                 TEXT,
    sentiment_shift               TEXT CHECK (sentiment_shift IN
                                  ('bullish', 'bearish', 'neutral', 'mixed')),
    information_asymmetry_score   SMALLINT CHECK (information_asymmetry_score BETWEEN 1 AND 10),
    supply_chain                  JSONB NOT NULL DEFAULT '[]'::jsonb,
    extracted_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asym_signals_ticker ON asymmetric_signals (ticker, extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_asym_signals_source ON asymmetric_signals (source_type, extracted_at DESC);

-- Alias view matching the 'time_series_metrics' naming in the platform spec;
-- price_snapshots (001) is the physical hypertable.
CREATE OR REPLACE VIEW time_series_metrics AS
    SELECT ticker, captured_at, price, change_1d_pct, volume, market_cap
    FROM price_snapshots;

COMMIT;
