export function createCrmLandingPage() {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tips CRM</title>
    <style>
      * { box-sizing: border-box; } body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f4f7f6; color: #10231f; font-family: Arial, sans-serif; }
      main { width: min(100%, 420px); padding: 34px 26px; background: #fff; border-radius: 24px; box-shadow: 0 16px 48px rgba(5,57,46,.12); text-align: center; }
      .mark { width: 54px; height: 54px; display: grid; place-items: center; margin: 0 auto 16px; border-radius: 16px; color: #fff; background: #00796b; font-weight: 900; font-size: 26px; }
      h1 { margin: 0; font-size: 23px; } p { color: #536761; line-height: 1.7; font-size: 14px; } a { display: block; margin-top: 18px; padding: 13px; border-radius: 12px; color: #fff; background: #00796b; font-weight: 800; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">T</div>
      <h1>Tips CRM</h1>
      <p id="copy">للدخول إلى النظام، استخدم تطبيق Tips CRM. إذا فتحت رابط استعادة كلمة المرور من بريدك، ستنتقل الصفحة تلقائياً إلى نموذج التعيين.</p>
      <a id="reset-link" href="/reset-password">فتح صفحة إعادة تعيين كلمة المرور</a>
    </main>
    <script>
      const query = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const isRecoveryLink = query.has("code") || query.has("token_hash") || fragment.has("access_token") || fragment.get("type") === "recovery";
      if (isRecoveryLink) {
        window.location.replace("/reset-password" + window.location.search + window.location.hash);
      }
    </script>
  </body>
</html>`;
}
