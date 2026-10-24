-- Each [[link]] in a topic's note, one row per link per line. Targets are stored as typed
-- (as link keys: whitespace collapsed, lowercased) and resolved when read, so a link starts
-- to count once a topic with that name exists, and follows renames that keep the old name.
-- Notes saved before this table existed are backfilled when it is created (migrations.rs).

create table note_links (
  id            integer primary key,
  source_topic  integer not null references topics (id) on delete cascade,
  -- link_key() of the whole target, and of the part before its first '#' when that differs.
  target_key    text not null,
  base_key      text,
  line          integer not null,
  -- The note line holding the link, verbatim, shown as context.
  context       text not null,
  unique (source_topic, target_key, line)
);

create index note_links_by_target on note_links (target_key);
create index note_links_by_source on note_links (source_topic);
