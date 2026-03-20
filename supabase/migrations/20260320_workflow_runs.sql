-- Durable workflow engine state table
-- Tracks multi-step workflow execution across serverless boundaries

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',  -- running, awaiting_approval, completed, failed, cancelled
  current_step VARCHAR(100) NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}',
  step_outputs JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_runs_name ON workflow_runs(workflow_name);
CREATE INDEX idx_workflow_runs_started ON workflow_runs(started_at DESC);
