-- Topics (graph nodes), the moments they were mentioned, connections between them
-- with the evidence for each, and pinned quotes.

create table topics (
  id                  integer primary key,
  name                text not null,
  state               text not null default 'active'
                      check (state in ('active', 'parked', 'done', 'dead')),
  check_in_at         text,
  idea_count          integer not null default 0,
  -- Running sum of member idea embeddings (little-endian f32); centroid = sum / count.
  centroid_sum        blob,
  first_mention_at    text,
  last_mention_at     text,
  decay_score         real not null default 0,
  decay_computed_at   text,
  merged_into         integer references topics (id),
  created_at          text not null,
  updated_at          text not null
);

create index topics_by_state on topics (state, decay_score);

create table topic_labels (
  id          integer primary key,
  topic_id    integer not null references topics (id) on delete cascade,
  label       text not null,
  -- Lowercased, whitespace-collapsed label for exact matching.
  norm        text not null,
  is_primary  integer not null default 0,
  unique (topic_id, norm)
);

create index topic_labels_by_norm on topic_labels (norm);

-- Each time a topic came up (an idea's first message), or was opened in the app.
create table mentions (
  id        integer primary key,
  topic_id  integer not null references topics (id) on delete cascade,
  kind      text not null check (kind in ('idea', 'opened')),
  at        text not null,
  weight    real not null,
  idea_id   integer references ideas (id) on delete cascade
);

create index mentions_by_topic on mentions (topic_id, at);

-- One edge per topic pair; kind is the strongest evidence type for the pair.
create table edges (
  id              integer primary key,
  topic_a         integer not null references topics (id) on delete cascade,
  topic_b         integer not null references topics (id) on delete cascade,
  kind            text not null check (kind in ('explicit', 'cooccurrence', 'semantic')),
  strength        real not null,
  evidence_count  integer not null,
  first_seen_at   text not null,
  last_seen_at    text not null,
  check (topic_a < topic_b),
  unique (topic_a, topic_b)
);

create table edge_evidence (
  id               integer primary key,
  edge_id          integer not null references edges (id) on delete cascade,
  idea_a           integer not null references ideas (id) on delete cascade,
  idea_b           integer not null references ideas (id) on delete cascade,
  at               text not null
);

create index edge_evidence_by_edge on edge_evidence (edge_id, at);

create table gems (
  id         integer primary key,
  topic_id   integer not null references topics (id) on delete cascade,
  idea_id    integer not null references ideas (id) on delete cascade,
  pinned_at  text not null,
  unique (topic_id, idea_id)
);

-- Which topics appeared on the Today shelf, so it doesn't repeat itself.
create table shelf_history (
  shown_on  text not null,
  reason    text not null,
  topic_id  integer not null references topics (id) on delete cascade,
  primary key (shown_on, reason)
);

create virtual table vec_ideas using vec0(
  idea_id integer primary key,
  embedding float[384] distance_metric=cosine
);

create virtual table vec_topics using vec0(
  topic_id integer primary key,
  embedding float[384] distance_metric=cosine
);
