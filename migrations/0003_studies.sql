-- ديوان القبيلة: دراسة واحدة لكل نوع، تُكمَل مرة وتبقى.

create table if not exists studies (
  user_id text not null,
  kind text not null,
  finish_at timestamptz,
  done boolean not null default false,
  primary key (user_id, kind)
);

create index if not exists studies_finish_idx on studies (finish_at) where done = false;
