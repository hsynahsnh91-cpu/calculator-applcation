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

المرحلة 3 نقلت واجهة الطالب:

- `src/app/App.tsx` القشرة
- `src/features/{chat,ocr,speech,probability,reference,history,scientific,equations,sequences,calculus,integration,geometry,matrices,complex}`
- `src/ui` للقطع المشتركة (Tex, Step, MathKeyPad, …)
- محرّكات العائلة تُحمَّل كسولاً من فقاعة الجواب

المرحلة 4 (الخادم فقط):

- دخول المدير عبر Google مع `ADMIN_EMAILS` (لا يُكتب البريد في الشيفرة)
- المعرفة والإخفاقات على Firestore عند ضبط حساب الخدمة، وإلا Redis كما كان
- Gemini على الخادم عبر `GEMINI_API_KEY`؛ الطالب لا يستدعي أي ذكاء
- بوابة النشر الثنائية لم تتغير: متصفح ثم خادم، والعقل لا ينشر

المرحلة 5 نقلت واجهة المدير دون حذف تبويب:

- `src/admin/app` القشرة وتسجيل الدخول
- `src/admin/features/{overview,scan,workspace,practice,library,publish,monitor,settings}`
- `src/admin/lib` للـAPI والحالة المحلية
- `types.ts` و`normalization.ts` و`enginePrompt.ts` بقيت في جذر `src/admin` لأن الخادم يستوردها
- المسح ومساحة العقل وتدرّب تُحمَّل كسولاً
- بوابة النشر الثنائية لم تتغير؛ الطالب ما زال بلا Gemini/Firebase
