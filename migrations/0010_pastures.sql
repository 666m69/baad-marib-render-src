-- سلسلة الحمى: مربعات يملكها اللاعب، لا حلقة حول الديرة.

create table if not exists pastures (
  user_id text not null,
  x integer not null,
  y integer not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, x, y)
);

create index if not exists pastures_xy_idx on pastures (x, y);

alter table tribes add column if not exists claim_x integer;
alter table tribes add column if not exists claim_y integer;
alter table tribes add column if not exists claim_food integer not null default 0;
alter table tribes add column if not exists claim_gold integer not null default 0;
alter table tribes add column if not exists claim_until timestamptz;
