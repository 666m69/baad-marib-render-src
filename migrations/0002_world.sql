-- بعد مأرب: shared valley. Per-player rows are scoped by user_id in server functions.
-- Other camps and bandits are public world state for signed-in players.

create table if not exists world_meta (
  id integer primary key,
  last_spawn timestamptz not null default now()
);

insert into world_meta (id, last_spawn)
values (1, now() - interval '1 day')
on conflict (id) do nothing;

create table if not exists tribes (
  user_id text primary key,
  name text not null,
  x integer not null,
  y integer not null,
  water integer not null,
  food integer not null,
  gold integer not null,
  wood integer not null,
  stone integer not null,
  people integer not null,
  people_bank integer not null default 0,
  infantry integer not null default 0,
  cavalry integer not null default 0,
  peace_until timestamptz,
  peace_extends integer not null default 0,
  attacked boolean not null default false,
  sanctuary integer not null default 1,
  expand_until timestamptz,
  move_x integer,
  move_y integer,
  move_until timestamptz,
  move_cost integer not null default 0,
  moves_done integer not null default 0,
  last_tick timestamptz not null default now(),
  last_raid_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists tribes_name_lower_idx on tribes (lower(name));
create index if not exists tribes_xy_idx on tribes (x, y);

create table if not exists buildings (
  user_id text not null,
  kind text not null,
  level integer not null default 0,
  upgrade_until timestamptz,
  primary key (user_id, kind)
);

create table if not exists trainings (
  id serial primary key,
  user_id text not null,
  kind text not null,
  qty integer not null,
  finish_at timestamptz not null
);

create index if not exists trainings_user_idx on trainings (user_id);

create table if not exists marches (
  id serial primary key,
  attacker_id text not null,
  target_kind text not null,
  target_id text not null,
  infantry integer not null,
  cavalry integer not null,
  from_x integer not null,
  from_y integer not null,
  to_x integer not null,
  to_y integer not null,
  depart_at timestamptz not null default now(),
  arrive_at timestamptz not null,
  status text not null default 'march'
);

create index if not exists marches_status_idx on marches (status, arrive_at);
create index if not exists marches_attacker_idx on marches (attacker_id);

create table if not exists bandits (
  id serial primary key,
  x integer not null,
  y integer not null,
  tier integer not null,
  infantry integer not null,
  cavalry integer not null,
  gold integer not null,
  food integer not null,
  water integer not null,
  wood integer not null,
  stone integer not null,
  unique (x, y)
);

create table if not exists reports (
  id serial primary key,
  user_id text not null,
  kind text not null,
  title text not null,
  body text not null,
  victory boolean,
  created_at timestamptz not null default now(),
  seen boolean not null default false
);

create index if not exists reports_user_idx on reports (user_id, id desc);
