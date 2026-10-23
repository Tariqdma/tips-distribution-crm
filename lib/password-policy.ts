export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 8) return "يجب أن تتكون كلمة المرور من ثمانية أحرف على الأقل.";
  if (!/[a-zA-Z\u0600-\u06FF]/.test(password)) return "يجب أن تحتوي كلمة المرور على حرف واحد على الأقل.";
  if (!/[0-9]/.test(password)) return "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.";
  if (password !== confirmation) return "كلمتا المرور غير متطابقتين.";
  return null;
}
