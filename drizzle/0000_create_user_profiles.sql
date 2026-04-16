CREATE TABLE IF NOT EXISTS user_profiles (
  clerk_user_id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  age text NOT NULL DEFAULT '',
  goals jsonb NOT NULL,
  schedule text NOT NULL,
  preferences jsonb NOT NULL,
  conditions jsonb NOT NULL,
  training_frequency text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
