# دليل النشر

## 1) تثبيت التبعيات

```bash
npm install
```

## 2) إعداد متغيرات البيئة

```bash
cp .env.example .env
```

ثم عدّل القيم وفق بيئة الإنتاج.

## 3) بناء المشروع

```bash
npm run build
```

## 4) التحقق من النوع

```bash
npm run typecheck
```

## 5) النشر على Vercel

1. أنشئ مشروعًا جديدًا على Vercel.
2. اربط المستودع: `666m69/baad-marib`
3. اختر الإعدادات الصحيحة لـ Node 22.
4. أضف المتغيرات البيئية المطلوبة من `.env.example`.
5. شغّل النشر.

## 6) متغيرات الإنتاج الأساسية

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GROK_AUTH_ISSUER`
- `GROK_AUTH_CLIENT_ID`
- `GROK_AUTH_CLIENT_SECRET`
- `VITE_AUTH_ENABLED`

## 7) بعد النشر

- تأكد من أن التطبيق يفتح بدون أخطاء JavaScript.
- تحقق من الاتصال بقاعدة البيانات.
- تحقق من تسجيل الدخول إن كان تم تفعيله.
- تحقق من أن الـ build النهائي يعمل دون أخطاء.

## 8) ملاحظات

- لا تضف secrets إلى الملف `.env` أثناء التسليم.
- لا تنشر قبل مراجعة الجودة النهائية.
- إن كان الهدف تجاريًا، أضف analytics و monetization و QA كاملة.
