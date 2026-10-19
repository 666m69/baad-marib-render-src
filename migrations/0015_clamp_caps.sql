-- السقف الجديد للذهب (بيت المال = 2000 + 1000×الخيمة) معتمد. ما فيه لاعبين حقيقيين بعد،
-- لكن القصّ لا يضيع: كل ما فوق السقف يُسجَّل أولاً في cap_clamp_log، ويُرجَع بسطر واحد
-- (docs/deploy.md، «Rollback 0015»). الذهب على بيت المال، والباقي على المخزن.
-- يطابق goldCap وstorageCap في src/lib/game/balance.ts. إعادة التشغيل لا تغيّر شيئاً.

create table if not exists cap_clamp_log (
  id bigserial primary key,
  user_id text not null,
  good text not null,
  removed integer not null,
  clamped_at timestamptz not null default now()
);

with caps as (
  select t.user_id,
         2000 + 1000 * greatest(1, coalesce(tent.level, 1)) as gcap,
         3000 + 1500 * least(10, greatest(0, coalesce(store.level, 0))) as scap,
         t.gold, t.water, t.food, t.wood, t.stone
  from tribes t
  left join buildings tent on tent.user_id = t.user_id and tent.kind = 'tent'
  left join buildings store on store.user_id = t.user_id and store.kind = 'storehouse'
)
insert into cap_clamp_log (user_id, good, removed)
select user_id, good, removed from (
  select user_id, 'gold' as good, gold - gcap as removed from caps
  union all select user_id, 'water', water - scap from caps
  union all select user_id, 'food', food - scap from caps
  union all select user_id, 'wood', wood - scap from caps
  union all select user_id, 'stone', stone - scap from caps
) over_cap
where removed > 0;

update tribes t set
  gold = least(t.gold, 2000 + 1000 * greatest(1, coalesce(tent.level, 1))),
  water = least(t.water, 3000 + 1500 * least(10, greatest(0, coalesce(store.level, 0)))),
  food = least(t.food, 3000 + 1500 * least(10, greatest(0, coalesce(store.level, 0)))),
  wood = least(t.wood, 3000 + 1500 * least(10, greatest(0, coalesce(store.level, 0)))),
  stone = least(t.stone, 3000 + 1500 * least(10, greatest(0, coalesce(store.level, 0))))
from tribes src
left join buildings tent on tent.user_id = src.user_id and tent.kind = 'tent'
left join buildings store on store.user_id = src.user_id and store.kind = 'storehouse'
where t.user_id = src.user_id;
