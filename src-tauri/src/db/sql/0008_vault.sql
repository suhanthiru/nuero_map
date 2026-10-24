-- The user's own notes, apart from topics: folders that nest, and notes written in the app
-- or imported from documents. Names are unique among siblings ignoring case and runs of
-- whitespace (`*_key` holds link_key() of the name); the top level is parent 0.

create table vault_folders (
  id          integer primary key,
  parent_id   integer references vault_folders (id) on delete cascade,
  name        text not null,
  name_key    text not null,
  created_at  text not null
);

create unique index vault_folders_by_name on vault_folders (ifnull(parent_id, 0), name_key);

create table vault_notes (
  id          integer primary key,
  folder_id   integer references vault_folders (id) on delete cascade,
  title       text not null,
  title_key   text not null,
  body        text not null,
  -- The file an imported note came from (its name); null for notes written here.
  source      text,
  created_at  text not null,
  updated_at  text not null
);

create unique index vault_notes_by_title on vault_notes (ifnull(folder_id, 0), title_key);
