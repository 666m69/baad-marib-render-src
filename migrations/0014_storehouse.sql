-- المخزن مبنى مستقل. الخيمة لم تعد تخزن الماء والطعام والخشب والحجر.
-- القبائل القائمة تُعطى مستوى مخزن لا تقل سعته عن سعة خيمتها القديمة:
-- القديم 4500 + 1400×الخيمة، والجديد 3000 + 1500×المخزن (حد 10).

insert into buildings (user_id, kind, level)
select
  t.user_id,
  'storehouse',
  least(10, greatest(0, ceil(((4500 + greatest(coalesce(b.level, 1), 1) * 1400) - 3000) / 1500.0)))::int
from tribes t
left join buildings b on b.user_id = t.user_id and b.kind = 'tent'
on conflict (user_id, kind) do nothing;
