-- Invitations table for secure token management
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) UNIQUE NOT NULL,
    guest_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    permissions TEXT[] DEFAULT ARRAY['guest'],
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- RSVP submissions table for secure data storage
CREATE TABLE rsvp_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID REFERENCES invitations(id),
    guest_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    attending BOOLEAN NOT NULL,
    guest_count INTEGER,
    meal_choices JSONB,
    submitted_at TIMESTAMP DEFAULT NOW(),
    confirmation_id VARCHAR(50) UNIQUE NOT NULL
);
