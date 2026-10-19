# بعد مأرب (baad-marib)

لعبة استراتيجية متصفح على طراز Travian: قبائل ما بعد انهيار سد مأرب في وادٍ واحد مشترك.

## تشغيل محلي

```sh
npm ci
npm run dev        # http://localhost:8080 — PGlite محلية في ./.data
```

## الفحوص

```sh
npm run typecheck && npm run lint && npm test && npm run build
# قفل الوادي على Postgres حقيقي (اختياري، يتخطى نفسه بدون الرابط):
TEST_PG_URL=postgres://baad:baad@127.0.0.1:5432/baad_test npm run test:pg
```

## النشر

Render (مجاني، فرانكفورت) + Neon. لا ينشر شيء تلقائياً (`autoDeploy: false`).
المتغيرات الإلزامية، وسطر تفعيل صاحب الديوان، والنسخ الاحتياطي: **[docs/deploy.md](docs/deploy.md)**.
