# نشر «بعد مأرب» (Render + Neon) — ملاحظات DevOps

لم يُنشر شيء بعد. هذا ما يلزم عند النشر.

## المتغيرات

كلها في Render Dashboard (`sync: false` في `render.yaml`)، ولا تُكتب في المستودع:

| المتغير | إلزامي | ملاحظة |
|---|---|---|
| `DATABASE_URL` | نعم | Neon فرانكفورت، رابط pooler مع `?sslmode=require` |
| `DATABASE_URL_UNPOOLED` | مستحسن | رابط Neon المباشر (بلا `-pooler`) مع `?sslmode=require`. للمهاجرات فقط (`scripts/migrate.mjs`)، وبدونه تستعمل `DATABASE_URL` |
| `BETTER_AUTH_SECRET` | نعم | 32 حرفاً عشوائياً على الأقل (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | نعم | الرابط العام https، مثل `https://baad-marib.onrender.com` |
| `ADMIN_EMAIL` | نعم | بريد صاحب الديوان |

في الإنتاج (`NODE_ENV=production`) **يخرج الخادم برمز 1 ولا يقلع** إن غاب `DATABASE_URL` أو
`BETTER_AUTH_SECRET` (أو كان أقصر من 32 حرفاً) أو `BETTER_AUTH_URL` (أو لم يكن https)،
ويكتب في السجل سطر `[start] refusing to start in production` مع اسم المتغير الناقص.
الفحص في `scripts/start.mjs` (أمر `startCommand`) قبل تحميل الخادم، ويتكرر في `src/lib/db.ts`
لأي مدخل آخر. **لا يوجد رجوع إلى PGlite في الإنتاج** ولا سر احتياطي؛ PGlite للتطوير المحلي فقط.

## Owner verification (تفعيل صاحب الديوان)

الديوان يحتاج شرطين معاً: البريد يساوي `ADMIN_EMAIL`، و`emailVerified = true`.
التسجيل بالبريد لا يتحقق من البريد بعد (P2). لذلك:

1. يسجّل المالك حساباً عادياً في اللعبة بالبريد نفسه.
2. يتأكد DevOps من أن المالك هو من سجّل (لا أحد غيره سبقه بالبريد نفسه).
3. يشغّل هذا السطر مرة واحدة على Neon، بعد وضع البريد الحقيقي:

<!-- owner-verify-sql -->
```sql
update "user" set "emailVerified" = true where lower(email) = lower('OWNER_EMAIL_HERE');
```

إن سبق أحدٌ المالكَ بالبريد نفسه: احذف ذلك الحساب أولاً، ولا تفعّله.
الحساب غير المفعّل بهذا البريد لا يرى الديوان ولا يملك أي صلاحية
(اختبار `auth-flow.test.ts`).

## حدود الدخول

- تسجيل الدخول: 5 محاولات في الدقيقة لكل IP.
- إنشاء الحساب: 5 في الساعة لكل IP.
- العدادات في جدول `"rateLimit"` (migration 0018)، فتصمد بعد إعادة التشغيل.
- IP العميل: `CF-Connecting-IP` (يضعه Cloudflare أمام Render)، وإلا الخانة التي أضافها
  آخر proxy في `X-Forwarded-For` (`TRUST_PROXY_HOPS`، الافتراضي 1). لا نثق أبداً بأول خانة.

## قبل أول ترحيل على قاعدة فيها لاعبون

خذ نسخة: `pg_dump "$DATABASE_URL" > before-migrate.sql` (أو branch في Neon). ما فيه down migrations.

### Rollback 0015

0015 تقصّ ما فوق السقوف الجديدة، وتسجّل كل ما قصّته في `cap_clamp_log` أولاً. للإرجاع:

<!-- rollback-0015-sql -->
```sql
update tribes t set gold = gold + coalesce((select sum(removed) from cap_clamp_log l where l.user_id = t.user_id and l.good = 'gold'), 0), water = water + coalesce((select sum(removed) from cap_clamp_log l where l.user_id = t.user_id and l.good = 'water'), 0), food = food + coalesce((select sum(removed) from cap_clamp_log l where l.user_id = t.user_id and l.good = 'food'), 0), wood = wood + coalesce((select sum(removed) from cap_clamp_log l where l.user_id = t.user_id and l.good = 'wood'), 0), stone = stone + coalesce((select sum(removed) from cap_clamp_log l where l.user_id = t.user_id and l.good = 'stone'), 0);
```

## Nitro

`nitro` مثبّت على نسخة بعينها (`3.0.260610-beta`) دون `^`، و`.npmrc` فيه `save-exact=true`.
لا تُرقّه إلا بعد بناء واختبار كاملين.

## فحص الصحة

`GET /health` ينفّذ `select 1`، ويرد 200 `ok`، أو 503 إن فشلت القاعدة أو تأخرت أكثر من 4 ثوانٍ.
`render.yaml` يضبط `healthCheckPath: /health`. الفحص لا يحرّك العالم ولا يُحسب نشاطاً للاعبين، فإيقاف
الإنتاج بعد 6 ساعات من غياب اللاعبين باقٍ كما هو.
ملاحظة لـ DevOps: ما دامت خدمة Render مستيقظة، يصل فحص Render كل بضع ثوانٍ إلى Neon. خدمة Render
المجانية تنام بعد 15 دقيقة بلا زيارات، والمتوقع أن تتوقف الفحوص معها. على DevOps أن يتأكد من ذلك
في لوحة Neon بعد النشر.

## المعاينات

`previews.generation: "off"` في جذر `render.yaml`: لا بيئات معاينة. لم يُضبط `previews` على الخدمة، وغيابه
يعني تعطيل معاينات PR (الحقل على الخدمة يقبل manual/automatic فقط). المرجع: https://render.com/docs/blueprint-spec
