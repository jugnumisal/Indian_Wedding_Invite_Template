-- Create blessings table
CREATE TABLE IF NOT EXISTS blessings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved BOOLEAN DEFAULT FALSE,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries on approved blessings
CREATE INDEX IF NOT EXISTS idx_blessings_approved ON blessings(approved, display_order);

-- Create index for faster queries by submission date
CREATE INDEX IF NOT EXISTS idx_blessings_submitted_at ON blessings(submitted_at DESC);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON blessings TO wedding_admin;
GRANT USAGE, SELECT ON SEQUENCE blessings_id_seq TO wedding_admin;
