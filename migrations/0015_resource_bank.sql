-- كسور الموارد تُحفظ بين التحديثات (بالأجزاء من الألف)، فلا يضيع النمو البطيء مع كثرة الاستطلاع.
alter table tribes add column if not exists water_bank integer not null default 0;
alter table tribes add column if not exists food_bank integer not null default 0;
alter table tribes add column if not exists gold_bank integer not null default 0;
alter table tribes add column if not exists wood_bank integer not null default 0;
alter table tribes add column if not exists stone_bank integer not null default 0;
