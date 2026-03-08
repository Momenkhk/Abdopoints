# Abdopoints Discord Bot

بوت ديسكورد مبني بـ Node.js لتسجيل نقاط عمليات الشراء.

## الميزات
- أمر `$tam <user>` لإضافة نقطة للعضو.
- إرسال رسالة خاصة عادية (بدون Components v2) للعضو بعد إضافة النقطة.
- بعد كل رسالة خاصة يرسل البوت رابط الصورة المحدد في `config.json`.
- حفظ النقاط وإعدادات الرتب داخل ملف JSON (`data/db.json`).
- أمر `$rotba <role> <عدد النقاط>` لربط رتبة بعدد نقاط محدد.
- عند وصول العضو للحد المطلوب، يحصل على الرتبة تلقائيًا مع رسالة خاصة.
- كل الأوامر تتطلب صلاحية `Administrator`.
- حالة البوت: `Watching Abdo Càfe` مع الحالة `idle` (قابلة للتعديل من `config.json`).

## الإعداد عبر config.json
عدّل ملف `config.json` وضع التوكن والإعدادات:
- `token`: توكن البوت (يمكن أيضًا استخدام `DISCORD_TOKEN` كمتغير بيئة).
- `prefix`: بادئة الأوامر (افتراضي `$`).
- `reviewUrl`: رابط التقييم المستخدم داخل الرسائل.
- `dmImageUrl`: الرابط الذي سيتم إرساله بعد كل رسالة DM.
- `presence`: إعدادات الحالة (`status`, `type`, `name`).

## التشغيل
1. ثبّت الحزم:
   ```bash
   npm install
   ```
2. شغّل البوت:
   ```bash
   npm start
   ```

> ملاحظة: فعّل `MESSAGE CONTENT INTENT` و `SERVER MEMBERS INTENT` من إعدادات البوت في Discord Developer Portal.
