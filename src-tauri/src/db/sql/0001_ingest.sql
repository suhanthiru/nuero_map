-- Conversations and messages normalized from every source.
-- Timestamps are RFC 3339 UTC text.

create table conversations (
  id              integer primary key,
  source          text not null check (source in ('claude', 'chatgpt', 'gemini')),
  source_conv_id  text not null,
  title           text not null,
  url             text,
  created_at      text not null,
  updated_at      text not null,
  -- The source's own "last updated" value, verbatim, for change detection.
  updated_marker  text not null,
  content_hash    text not null,
  message_count   integer not null default 0,
  imported_at     text not null,
  unique (source, source_conv_id)
);

create table messages (
  id               integer primary key,
  conversation_id  integer not null references conversations (id) on delete cascade,
  source_msg_id    text not null,
  seq              integer not null,
  role             text not null check (role in ('user', 'assistant')),
  text             text not null,
  created_at       text not null,
  -- 'source' = timestamp from the export, 'capture' = client clock at capture time.
  time_source      text not null default 'source' check (time_source in ('source', 'capture')),
  -- 1 when a later import moved the conversation to another branch.
  superseded       integer not null default 0,
  unique (conversation_id, source_msg_id)
);

create index messages_by_conversation on messages (conversation_id, superseded, seq);

create table import_runs (
  id           integer primary key,
  source       text not null,
  path         text not null,
  started_at   text not null,
  finished_at  text,
  report_json  text
);

create table settings (
  key    text primary key,
  value  text not null
);
