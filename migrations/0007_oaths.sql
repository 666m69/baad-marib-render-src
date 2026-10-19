-- عهود الوادي: تُقبض مرة واحدة لكل قبيلة.

create table if not exists oaths (
  user_id text not null,
  kind text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, kind)
);
