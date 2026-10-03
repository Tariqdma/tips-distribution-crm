# دليل نشر Tips CRM

## متطلبات النشر

- Node.js 20+
- حساب Expo (لبناء تطبيقات الهاتف)
- حساب Supabase (قاعدة البيانات والمصادقة)
- حساب Resend (البريد الإلكتروني)

---

## 1. إعداد متغيرات البيئة

انسخ `.env.example` إلى `.env`:

```bash
cp .env.example .env
```

عبّئ المتغيرات التالية:

| المتغير | الوصف |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | عنوان مشروع Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | مفتاح Supabase العام |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح الخدمة (للسيرفر فقط، لا تنشره) |
| `RESEND_API_KEY` | مفتاح Resend للبريد الإلكتروني |
| `RESEND_FROM_EMAIL` | عنوان المرسل (مثال: `noreply@your-domain.com`) |
| `EXPO_PUBLIC_APP_URL` | عنوان الموقع في الإنتاج |
| `PORT` | منفذ السيرفر (افتراضي: 3000) |

---

## 2. نشر الموقع (Web)

### البناء:
```bash
npm run build
```
هذا ينفذ:
1. `expo export --platform web` — يولّد الواجهة في `public-web/`
2. `esbuild` — يبني السيرفر في `dist/`

### التشغيل في الإنتاج:
```bash
NODE_ENV=production node dist/index.js
```

### النشر على خدمات Cloud:

**Render.com:**
- Build Command: `npm run build`
- Start Command: `node dist/index.js`
- Environment Variables: عبّئها من `.env.example`

**Railway.app:**
- يكتشف تلقائياً `npm run build` و `npm start`
- أضف متغيرات البيئة في لوحة التحكم

---

## 3. نشر تطبيق Android

### المتطلبات:
```bash
npm install -g eas-cli
eas login
```

### بناء APK للاختبار (مجاني):
```bash
eas build --platform android --profile preview
```

### بناء AAB للنشر على Google Play:
```bash
eas build --platform android --profile production
```

### ملاحظات النشر على Google Play:
1. أنشئ تطبيقاً جديداً في [Google Play Console](https://play.google.com/console)
2. ارفع ملف AAB في قسم "Internal testing"
3. بعد الاختبار، ارفعه إلى "Production"

---

## 4. نشر تطبيق iOS (اختياري)

```bash
eas build --platform ios --profile production
eas submit --platform ios
```
يتطلب Apple Developer Account ($99/سنة).

---

## 5. إعداد Supabase للإنتاج

1. تطبيق ملفات SQL من مجلد `supabase/` بالترتيب الموجود في `supabase/README.md`
2. في **Supabase Dashboard → Authentication → URL Configuration**:
   - Site URL: `https://your-domain.com`
   - Redirect URLs: أضف `https://your-domain.com/**`
3. في **Authentication → Email Templates**: خصص قوالب البريد

---

## 6. مدير المنصة الأول

بعد النشر، سجّل الدخول بالحساب الذي تريده مديراً للمنصة، ثم نفّذ:
```sql
-- في Supabase SQL Editor
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"is_platform_admin": true}'
WHERE email = 'your-admin@email.com';
```

---

## 7. اختبار الإعداد

- الموقع: `https://your-domain.com`
- بوابة المنصة: `https://your-domain.com/platform`
- Health check: `https://your-domain.com/api/health`

---

## 8. النشر على Hostinger (crm.tips-sd.com)

الموقع يعمل كتطبيق **Node.js** (Express يخدم الواجهة `public-web/` وكل مسارات `/api/*`).
واجهة الويب مبنية مسبقاً ومرفوعة في المستودع، لذلك البناء على Hostinger خفيف (السيرفر فقط).

> لا ترفع ملفات المستودع يدوياً إلى مجلد الموقع — هذا يكشف الكود وملفات SQL للعامة.

### إعدادات البناء (hPanel → Node.js Web App)

| الإعداد | القيمة |
|---|---|
| المصدر | GitHub → `Tariqdma/tips-distribution-crm` → فرع `authorization-model` |
| Framework | Express |
| Node.js | 20 أو 22 |
| Root directory | `.` |
| Package manager | npm |
| Build script | `build:server` |
| Entry file | `dist/index.js` |

### متغيرات البيئة

```
NODE_ENV=production
TIPS_CRM_PUBLIC_URL=https://crm.tips-sd.com
EXPO_PUBLIC_APP_URL=https://crm.tips-sd.com
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # سري
RESEND_API_KEY=...              # سري
RESEND_FROM_EMAIL=...
```

### عند تعديل الواجهة

أعد بناء الواجهة محلياً وارفعها مع الكود:

```bash
EXPO_PUBLIC_APP_URL=https://crm.tips-sd.com npm run export:web
git add public-web && git commit -m "deploy: rebuild web bundle" && git push
```
