/** Arabic text for a Better Auth error, keyed by its code and HTTP status, never by guessing at the English message. */
export type AuthErrorLike = { code?: string; status?: number; message?: string };

export function arabicAuthError(err: AuthErrorLike): string {
  const code = err.code ?? "";
  if (err.status === 429) return "محاولات كثيرة. انتظر دقيقة ثم حاول.";
  if (code.startsWith("USER_ALREADY_EXISTS")) return "هذا البريد مسجّل. ادخل بدل التسجيل.";
  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_PASSWORD" || code === "USER_EMAIL_NOT_FOUND")
    return "البريد أو كلمة السر غير صحيحة.";
  if (code === "PASSWORD_TOO_SHORT") return "كلمة السر قصيرة. ثمانية أحرف على الأقل.";
  if (code === "PASSWORD_TOO_LONG") return "كلمة السر طويلة جداً.";
  if (code === "INVALID_EMAIL") return "تحقق من صيغة البريد.";
  if (code === "INVALID_ORIGIN" || code === "MISSING_OR_NULL_ORIGIN") return "تعذّر الدخول من هذا العنوان.";
  return "تعذّر الدخول. حاول مرة أخرى.";
}
