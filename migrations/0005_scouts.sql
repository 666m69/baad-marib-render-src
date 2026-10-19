-- طليعة لا تحمل جنداً، وتقرير قوة يبقى عند صاحبها دقائق.

alter table marches add column if not exists purpose text not null default 'attack';

create table if not exists intel (
  user_id text not null,
  target_kind text not null,
  target_id text not null,
  detail text not null,
  expires_at timestamptz not null,
  primary key (user_id, target_kind, target_id)
);
