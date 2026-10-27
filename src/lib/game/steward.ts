/**
 * Who may open the ديوان (admin board). Decided on the server only, from the
 * ADMIN_EMAIL environment variable, and only for an account whose email the
 * auth server has marked verified. There is no self-claim and no stored grant:
 * removing an address from ADMIN_EMAIL removes the access.
 */
export type Account = { id: string; email: string | null; emailVerified: boolean };

export function adminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isSteward(account: Account | null | undefined, adminEmailEnv: string | undefined): boolean {
  if (!account || !account.email || account.emailVerified !== true) return false;
  return adminEmails(adminEmailEnv).includes(account.email.trim().toLowerCase());
}
