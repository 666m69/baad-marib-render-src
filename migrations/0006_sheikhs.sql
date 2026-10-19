-- شيخ لكل قبيلة، وصعاليك على حافة الوادي.

alter table tribes add column if not exists sheikh_name text not null default '';
alter table tribes add column if not exists sheikh_trait text not null default 'guard';
alter table tribes add column if not exists renown integer not null default 0;

create table if not exists saalik (
  id serial primary key,
  name text not null,
  line text not null,
  x integer not null,
  y integer not null,
  cavalry integer not null,
  gold integer not null,
  food integer not null,
  unique (x, y)
);
