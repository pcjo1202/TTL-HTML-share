import { createDoc } from "@/lib/store";
import { uploadRatelimit, clientIp } from "@/lib/ratelimit";
import { isValidTtl } from "@/lib/ttl";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  const { success } = await uploadRatelimit.limit(clientIp(req));
  if (!success) {
    return Response.json({ error: "요청이 너무 잦습니다." }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const ttl = String(form.get("ttl") ?? "");

  if (!(file instanceof File) || !name || !password || !isValidTtl(ttl)) {
    return Response.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "파일은 최대 10MB까지 가능합니다." }, { status: 413 });
  }

  const html = await file.text();
  const { id } = await createDoc({ name, html, password, ttl }, Date.now());

  const url = new URL(`/d/${id}`, req.url).toString();
  return Response.json({ id, url });
}
