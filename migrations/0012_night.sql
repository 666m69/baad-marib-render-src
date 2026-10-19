-- بيعة الصعلوك تفتح غارة الليل: الاسم وأصل السهم يُخفيان عن غير صاحب الغارة.
alter table tribes add column if not exists saalik_pacts integer not null default 0;
alter table marches add column if not exists masked boolean not null default false;
