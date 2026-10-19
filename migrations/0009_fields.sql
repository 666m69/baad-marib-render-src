-- حقول الموارد: كل موضع مستوى مستقل، مثل قرى الوادي.

create table if not exists fields (
  user_id text not null,
  slot integer not null,
  good text not null,
  level integer not null default 0,
  upgrade_until timestamptz,
  primary key (user_id, slot)
);
