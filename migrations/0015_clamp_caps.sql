-- السقف الجديد للذهب (بيت المال = 2000 + 1000×الخيمة) معتمد. ما فيه لاعبين حقيقيين بعد،
-- فيكفي أن نقصّ أي مخزون فوق سقفه إلى السقف: الذهب على بيت المال، والباقي على المخزن.
-- يطابق goldCap وstorageCap في src/lib/game/balance.ts. إعادة التشغيل لا تغيّر شيئاً.

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
