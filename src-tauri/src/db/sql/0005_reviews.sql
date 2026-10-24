-- Weekly reviews: a test written from one week's ideas, the answers given, the grades,
-- and the study guide built from them.

create table reviews (
  id             integer primary key,
  -- The local Monday the week starts on (YYYY-MM-DD).
  week_of        text not null,
  period_start   text not null,
  period_end     text not null,
  status         text not null default 'generating'
                 check (status in ('generating', 'ready', 'grading', 'graded', 'failed')),
  model          text not null,
  idea_count     integer not null,
  -- The rendered material the questions were written from, so grading sees the same.
  material       text not null,
  idea_ids_json  text not null,
  -- Shown to the user: why generation or grading failed.
  error          text,
  score          real,
  guide_json     text,
  created_at     text not null,
  submitted_at   text,
  graded_at      text
);

create index reviews_by_week on reviews (week_of, created_at);

create table review_questions (
  id                   integer primary key,
  review_id            integer not null references reviews (id) on delete cascade,
  seq                  integer not null,
  kind                 text not null check (kind in ('mcq', 'frq')),
  topic_id             integer references topics (id) on delete set null,
  topic_name           text not null,
  difficulty           text not null,
  prompt               text not null,
  -- Multiple choice: the options and the correct one. Free response: [] and null.
  choices_json         text not null,
  answer_index         integer,
  -- Multiple choice: why the answer is right. Free response: a model answer.
  explanation          text not null,
  -- Free response: the rubric. Multiple choice: [].
  key_points_json      text not null,
  source_ids_json      text not null,
  -- Multiple choice: the chosen index as text. Free response: the written answer.
  response             text,
  points               real,
  max_points           real not null,
  feedback             text,
  -- Free response: 'met' / 'partial' / 'missed' per key point.
  key_points_met_json  text,
  unique (review_id, seq)
);
