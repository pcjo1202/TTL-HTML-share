export type TtlOption = "never" | `${number}d`;

const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_TTL_DAYS = 365;

export function parseTtl(value: string): number | "never" | null {
  if (value === "never") return "never";
  const match = /^([1-9]\d*)d$/.exec(value);
  if (!match) return null;
  const days = Number(match[1]);
  if (days < 1 || days > MAX_TTL_DAYS) return null;
  return days;
}

export function isValidTtl(value: string): value is TtlOption {
  return parseTtl(value) !== null;
}

export function computeExpiresAt(ttl: TtlOption, now: number): number | "never" {
  const parsed = parseTtl(ttl);
  if (parsed === "never") return "never";
  if (parsed === null) throw new Error(`잘못된 TTL 값입니다: ${ttl}`);
  return now + parsed * DAY_MS;
}

export function isExpired(expiresAt: number | "never", now: number): boolean {
  if (expiresAt === "never") return false;
  return now > expiresAt;
}
