export type TtlOption = "1d" | "7d" | "30d" | "never";

const DAY_MS = 24 * 60 * 60 * 1000;

export const TTL_DURATIONS: Record<Exclude<TtlOption, "never">, number> = {
  "1d": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
};

export function isValidTtl(value: string): value is TtlOption {
  return value === "1d" || value === "7d" || value === "30d" || value === "never";
}

export function computeExpiresAt(
  ttl: TtlOption,
  now: number,
): number | "never" {
  if (ttl === "never") return "never";
  return now + TTL_DURATIONS[ttl];
}

export function isExpired(expiresAt: number | "never", now: number): boolean {
  if (expiresAt === "never") return false;
  return now > expiresAt;
}
