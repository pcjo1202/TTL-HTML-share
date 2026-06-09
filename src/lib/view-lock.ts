import { createHash, timingSafeEqual } from "node:crypto";

export function unlockCookieName(id: string): string {
  return `unlock_${id}`;
}

export function unlockToken({
  id,
  viewPasswordHash,
}: {
  id: string;
  viewPasswordHash: string;
}): string {
  return createHash("sha256").update(`${id}:${viewPasswordHash}`).digest("hex");
}

export function isValidUnlockCookie({
  cookieValue,
  id,
  viewPasswordHash,
}: {
  cookieValue: string | undefined;
  id: string;
  viewPasswordHash: string;
}): boolean {
  if (!cookieValue) return false;
  const expected = unlockToken({ id, viewPasswordHash });
  const candidate = Buffer.from(cookieValue);
  const target = Buffer.from(expected);
  if (candidate.length !== target.length) return false;
  return timingSafeEqual(candidate, target);
}
