-- مكافآت المرشد، وعدد مرات السوق.

alter table tribes add column if not exists trades integer not null default 0;

create table if not exists guide_claims (
  user_id text not null,
  kind text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, kind)
);
