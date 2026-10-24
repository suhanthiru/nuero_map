-- The user's own markdown note on a topic, written in the app. One per topic; an empty
-- note is deleted rather than stored.

create table topic_notes (
  topic_id    integer primary key references topics (id) on delete cascade,
  body        text not null,
  updated_at  text not null
);
