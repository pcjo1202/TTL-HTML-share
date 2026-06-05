import { put, del } from "@vercel/blob";
import { redis } from "./redis";
import { generateId } from "./id";
import { hashPassword } from "./password";
import { computeExpiresAt, type TtlOption } from "./ttl";

export interface DocRecord {
  id: string;
  name: string;
  passwordHash: string;
  salt: string;
  blobUrl: string;
  createdAt: number;
  expiresAt: number | "never";
}

export interface DocView extends DocRecord {
  views: number;
}

const EXPIRY_INDEX = "expiry:index";
const docKey = (id: string) => `doc:${id}`;
const viewsKey = (id: string) => `views:${id}`;

export async function createDoc(
  input: { name: string; html: string; password: string; ttl: TtlOption },
  now: number,
): Promise<{ id: string; expiresAt: number | "never" }> {
  const id = generateId();
  const { hash, salt } = hashPassword(input.password);
  const blob = await put(`docs/${id}.html`, input.html, {
    access: "public",
    contentType: "text/html; charset=utf-8",
  });
  const expiresAt = computeExpiresAt(input.ttl, now);
  const record: DocRecord = {
    id,
    name: input.name,
    passwordHash: hash,
    salt,
    blobUrl: blob.url,
    createdAt: now,
    expiresAt,
  };
  await redis.set(docKey(id), record);
  await redis.set(viewsKey(id), 0);
  if (expiresAt !== "never") {
    await redis.zadd(EXPIRY_INDEX, { score: expiresAt, member: id });
  }
  return { id, expiresAt };
}

export async function getDoc(id: string): Promise<DocView | null> {
  const record = (await redis.get(docKey(id))) as DocRecord | null;
  if (!record) return null;
  const views = ((await redis.get(viewsKey(id))) as number | null) ?? 0;
  return { ...record, views };
}

export async function incrementViews(id: string): Promise<void> {
  await redis.incr(viewsKey(id));
}

export async function extendDoc(
  id: string,
  ttl: TtlOption,
  now: number,
): Promise<void> {
  const record = (await redis.get(docKey(id))) as DocRecord | null;
  if (!record) return;
  const expiresAt = computeExpiresAt(ttl, now);
  await redis.set(docKey(id), { ...record, expiresAt });
  if (expiresAt === "never") {
    await redis.zrem(EXPIRY_INDEX, id);
  } else {
    await redis.zadd(EXPIRY_INDEX, { score: expiresAt, member: id });
  }
}

export async function deleteDoc(id: string): Promise<void> {
  const record = (await redis.get(docKey(id))) as DocRecord | null;
  if (record) {
    await del(record.blobUrl);
  }
  await redis.del(docKey(id), viewsKey(id));
  await redis.zrem(EXPIRY_INDEX, id);
}

export async function sweepExpired(now: number): Promise<string[]> {
  const expired = (await redis.zrange(EXPIRY_INDEX, 0, now, {
    byScore: true,
  })) as string[];
  for (const id of expired) {
    await deleteDoc(id);
  }
  return expired;
}
