-- أصل القبيلة من هجرة مأرب: أوس، غسان، لخم، أزد عمان، خزاعة.
alter table tribes add column if not exists lineage text not null default '';
