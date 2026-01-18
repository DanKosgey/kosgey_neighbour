-- Migration: Add session_lock table
-- This table prevents multiple instances from connecting to WhatsApp simultaneously

CREATE TABLE IF NOT EXISTS session_lock (
    id SERIAL PRIMARY KEY,
    session_name VARCHAR(100) NOT NULL UNIQUE,
    instance_id TEXT NOT NULL,
    locked_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_lock_name ON session_lock(session_name);
CREATE INDEX IF NOT EXISTS idx_session_lock_expires ON session_lock(expires_at);

-- Clean up any expired locks (optional, but helpful)
DELETE FROM session_lock WHERE expires_at < NOW();
