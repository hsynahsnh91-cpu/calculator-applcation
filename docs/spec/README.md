# مواصفات إعادة البناء

ملفات `00`–`05` لم تكن داخل المستودع. النص المعتمد هو ما أرسله صاحب المشروع في جلسة إعادة البناء.

الهيكل الذي أُنشئ في المرحلة 1 (بدون نقل منطق):

- `src/app` القشرة والمزودات
- `src/ui` نظام التصميم
- `src/features` ميزات الطالب
- `src/core/solver` و`src/core/engines` و`src/core/knowledge`
- `src/shared` مخططات zod الحالية
- `src/brain/tools` و`src/brain/conversation` (العقل القائم بقي في مكانه)
- `tests/unit` و`tests/golden` و`tests/e2e`
- `docs/perf` لتقارير الحجم لاحقًا

المرحلة 2 نقلت المحركات والمحلل والاختبارات:

- `src/core/solver` و`src/core/engines/*` و`src/core/knowledge`
- الاختبارات في `tests/unit` مع بقاء المشغّل `tests/run.mjs`
- `naturalDisplay.ts` صار `naturalDisplayTree.ts` لتفادي تضارب الاسم مع `NaturalDisplay.tsx`

لم تُنقل مكوّنات المحادثة (`src/components/chat` وغيرها) — المرحلة 3.
