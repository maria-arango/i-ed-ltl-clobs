-- Amendment B §18: availability is entered as videos-per-day with a date
-- range. fte_percent stays for the record (derived: 3/day = 100%).
ALTER TABLE coder_availability ADD COLUMN videos_per_day real NOT NULL DEFAULT 3;
ALTER TABLE coder_availability ALTER COLUMN fte_percent SET DEFAULT 100;
