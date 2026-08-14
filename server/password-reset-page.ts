function escapeJsonForScript(value: string) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function createPasswordResetPage({
  supabaseUrl,
  supabaseAnonKey,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const configurationMissing = !supabaseUrl || !supabaseAnonKey;

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>إعادة تعيين كلمة المرور | Tips CRM</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font-family: Arial, sans-serif; background: #f4f7f6; color: #10231f; }
      main { width: min(100%, 430px); padding: 32px 28px; border-radius: 24px; background: #ffffff; box-shadow: 0 16px 48px rgba(5, 57, 46, .12); }
      .mark { width: 48px; height: 48px; display: grid; place-items: center; margin: 0 auto 18px; border-radius: 14px; background: #00796b; color: #fff; font-size: 25px; font-weight: 800; }
      h1 { margin: 0; font-size: 24px; text-align: center; }
      p { color: #536761; line-height: 1.6; text-align: center; }
      label { display: block; margin: 22px 0 8px; font-weight: 700; }
      input { width: 100%; border: 1px solid #cbd8d4; border-radius: 12px; padding: 14px; font-size: 16px; }
      button { width: 100%; margin-top: 22px; border: 0; border-radius: 12px; padding: 14px; background: #00796b; color: #fff; font-size: 16px; font-weight: 700; }
      button:disabled { opacity: .6; }
      #message { min-height: 24px; margin: 18px 0 0; font-weight: 700; }
      .error { color: #b63838; } .success { color: #087345; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">T</div>
      <h1>تعيين كلمة مرور جديدة</h1>
      <p>اختر كلمة مرور جديدة لحسابك في Tips CRM.</p>
      <form id="reset-form">
        <label for="password">كلمة المرور الجديدة</label>
        <input id="password" type="password" autocomplete="new-password" minlength="8" required placeholder="ثمانية أحرف على الأقل" />
        <label for="confirm-password">تأكيد كلمة المرور</label>
        <input id="confirm-password" type="password" autocomplete="new-password" minlength="8" required placeholder="أعد كتابة كلمة المرور" />
        <button id="submit" type="submit">حفظ كلمة المرور</button>
      </form>
      <p id="message" role="status"></p>
    </main>
    <script>
      const SUPABASE_URL = ${escapeJsonForScript(supabaseUrl)};
      const SUPABASE_ANON_KEY = ${escapeJsonForScript(supabaseAnonKey)};
      const CONFIGURATION_MISSING = ${configurationMissing};
      const form = document.getElementById("reset-form");
      const submitButton = document.getElementById("submit");
      const message = document.getElementById("message");
      const query = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      let recoveryAccessToken = fragment.get("access_token");
      let recoveryReady = false;

      function setMessage(text, kind) {
        message.textContent = text;
        message.className = kind || "";
      }

      async function prepareRecovery() {
        if (CONFIGURATION_MISSING) {
          throw new Error("تعذر إعداد صفحة الاستعادة. حاول مرة أخرى لاحقاً.");
        }
        const code = query.get("code");

        if (code) {
          throw new Error("هذا رابط استعادة قديم لا يمكن التحقق منه على الهاتف. اطلب رابطاً جديداً من شاشة الدخول ثم افتحه من نفس الهاتف.");
        }

        if (!recoveryAccessToken) {
          throw new Error("رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً من شاشة الدخول.");
        }

        window.history.replaceState({}, document.title, window.location.pathname);
        recoveryReady = true;
        submitButton.disabled = false;
        setMessage("أدخل كلمة المرور الجديدة ثم اضغط حفظ.");
      }

      submitButton.disabled = true;
      setMessage("جارٍ التحقق من رابط الاستعادة…");
      prepareRecovery().catch((error) => {
        setMessage(error instanceof Error ? error.message : "تعذر التحقق من رابط الاستعادة. اطلب رابطاً جديداً وحاول مرة أخرى.", "error");
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!recoveryReady || !recoveryAccessToken) return;
        const password = document.getElementById("password").value;
        const confirmation = document.getElementById("confirm-password").value;
        if (password.length < 8) { setMessage("كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل.", "error"); return; }
        if (password !== confirmation) { setMessage("كلمتا المرور غير متطابقتين.", "error"); return; }

        submitButton.disabled = true;
        setMessage("جارٍ حفظ كلمة المرور…");
        try {
          const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
            method: "PUT",
            headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + recoveryAccessToken },
            body: JSON.stringify({ password }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.message || "تعذر حفظ كلمة المرور.");
          form.reset();
          setMessage("تم تغيير كلمة المرور بنجاح. يمكنك العودة إلى التطبيق وتسجيل الدخول الآن.", "success");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "تعذر حفظ كلمة المرور. اطلب رابطاً جديداً وحاول مرة أخرى.", "error");
          submitButton.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
}
