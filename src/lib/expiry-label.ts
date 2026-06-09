export type ExpiryStatus = "permanent" | "soon" | "active";

export interface ExpiryLabel {
  text: string;
  status: ExpiryStatus;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function expiryLabel(
  expiresAt: number | "never",
  now: number,
): ExpiryLabel {
  if (expiresAt === "never") return { text: "영구", status: "permanent" };
  const days = Math.ceil((expiresAt - now) / DAY_MS);
  if (days <= 0) return { text: "곧 만료", status: "soon" };
  return { text: `D-${days}`, status: "active" };
}
