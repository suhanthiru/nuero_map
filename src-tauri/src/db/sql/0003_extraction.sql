-- Extraction: conversations are split into windows, each window is sent to Claude, and
-- the ideas it returns are stored with links back to their source messages.

-- content_hash of the conversation when its windows were last planned.
alter table conversations add column planned_hash text;

create table extraction_windows (
  id               integer primary key,
  conversation_id  integer not null references conversations (id) on delete cascade,
  window_index     integer not null,
  first_seq        integer not null,
  last_seq         integer not null,
  -- A single oversize message is split into parts, each its own window.
  part_index       integer not null default 0,
  part_count       integer not null default 1,
  window_hash      text not null,
  status           text not null default 'pending'
                   check (status in ('pending', 'submitted', 'done', 'failed')),
  batch_id         text,
  attempts         integer not null default 0,
  error            text,
  created_at       text not null,
  updated_at       text not null,
  unique (conversation_id, window_index)
);

create index windows_by_status on extraction_windows (status, batch_id);

create table ideas (
  id                    integer primary key,
  conversation_id       integer not null references conversations (id) on delete cascade,
  window_id             integer not null references extraction_windows (id) on delete cascade,
  idea_index            integer not null,
  title                 text not null,
  summary               text not null,
  kind                  text not null,
  topic_label           text not null,
  excerpt               text not null,
  excerpt_verified      integer not null,
  is_user_originated    integer not null,
  gem_candidate         integer not null,
  first_message_at      text not null,
  topic_id              integer,
  assignment_method     text,
  assignment_sim        real,
  duplicate_of_idea_id  integer,
  created_at            text not null,
  unique (window_id, idea_index)
);

create index ideas_by_topic on ideas (topic_id, first_message_at);
create index ideas_unassigned on ideas (id) where topic_id is null;

create table idea_messages (
  idea_id     integer not null references ideas (id) on delete cascade,
  message_id  integer not null references messages (id) on delete cascade,
  primary key (idea_id, message_id)
);

create table idea_aliases (
  idea_id  integer not null references ideas (id) on delete cascade,
  alias    text not null,
  primary key (idea_id, alias)
);

-- Ideas the extractor said build on each other within one window.
create table idea_relations (
  idea_id          integer not null references ideas (id) on delete cascade,
  related_idea_id  integer not null references ideas (id) on delete cascade,
  primary key (idea_id, related_idea_id)
);

create table llm_batches (
  id               integer primary key,
  batch_id         text not null unique,
  status           text not null,
  request_count    integer not null,
  submitted_at     text not null,
  ended_at         text,
  results_fetched  integer not null default 0
);

-- Token usage per API call, for cost tracking.
create table llm_calls (
  id                  integer primary key,
  purpose             text not null,
  model               text not null,
  batch_id            text,
  input_tokens        integer not null,
  output_tokens       integer not null,
  cache_read_tokens   integer not null,
  cache_write_tokens  integer not null,
  created_at          text not null
);
