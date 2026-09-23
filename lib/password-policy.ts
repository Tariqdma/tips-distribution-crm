export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 8) return "يجب أن تتكون كلمة المرور من ثمانية أحرف على الأقل.";
  if (password !== confirmation) return "كلمتا المرور غير متطابقتين.";
  return null;
}
