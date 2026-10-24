-- Durable background jobs. A crash mid-job leaves status = 'running'; startup recovery
-- puts those back to 'queued'. Timestamps use the fixed-width format from db::ts so
-- run_after comparisons are lexicographic.

create table jobs (
  id              integer primary key,
  kind            text not null,
  status          text not null default 'queued'
                  check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  priority        integer not null default 0,
  payload         text not null,
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  run_after       text not null,
  locked_at       text,
  stage           text not null default 'queued',
  progress_done   integer not null default 0,
  progress_total  integer not null default 0,
  message         text,
  last_error      text,
  error_code      text,
  result          text,
  parent_job_id   integer references jobs (id),
  -- The job a pipeline started from (itself when it has no parent).
  root_job_id     integer,
  dedupe_key      text,
  created_at      text not null,
  updated_at      text not null,
  finished_at     text
);

create index jobs_ready on jobs (status, run_after, priority);
create index jobs_by_root on jobs (root_job_id, status);
create unique index jobs_dedupe on jobs (dedupe_key) where status in ('queued', 'running');
