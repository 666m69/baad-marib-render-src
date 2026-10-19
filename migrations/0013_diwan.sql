-- صاحب الديوان واحد. رسائل اللاعبين إليه، والرد يعود تقريراً.

create table if not exists stewards (
  user_id text primary key,
  claimed_at timestamptz not null default now()
);

create table if not exists letters (
  id serial primary key,
  user_id text not null,
  body text not null,
  created_at timestamptz not null default now(),
  seen boolean not null default false,
  reply text,
  replied_at timestamptz
);

create index if not exists letters_user_idx on letters (user_id, id desc);
