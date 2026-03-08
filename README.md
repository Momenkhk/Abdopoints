# Abdopoints Discord Bot

بوت ديسكورد مبني بـ Node.js لتسجيل نقاط عمليات الشراء.

## الميزات
- أمر `$tam <user>` لإضافة نقطة للعضو.
- إرسال رسالة خاصة تلقائيًا للعضو بعد إضافة النقطة باستخدام Components v2.
- حفظ النقاط وإعدادات الرتب داخل ملف JSON (`data/db.json`).
- أمر `$rotba <role> <عدد النقاط>` لربط رتبة بعدد نقاط محدد.
- عند وصول العضو للحد المطلوب، يحصل على الرتبة تلقائيًا مع رسالة خاصة.
- كل الأوامر تتطلب صلاحية `Administrator`.
- حالة البوت: `Watching Abdo Càfe` مع الحالة `idle`.

## التشغيل
1. ثبّت الحزم:
   ```bash
   npm install
   ```
2. شغّل البوت باستخدام توكن الديسكورد:
   ```bash
   DISCORD_TOKEN=your_token_here npm start
   ```

> ملاحظة: فعّل `MESSAGE CONTENT INTENT` و `SERVER MEMBERS INTENT` من إعدادات البوت في Discord Developer Portal.
