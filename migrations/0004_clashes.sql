-- معارك ظاهرة على الخريطة لثوانٍ بعد الحسم. صفوف عامة لكل من في الوادي.

create table if not exists clashes (
  id serial primary key,
  x integer not null,
  y integer not null,
  attacker_name text not null,
  defender_name text not null,
  attacker_wins boolean not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists clashes_created_idx on clashes (created_at desc);
