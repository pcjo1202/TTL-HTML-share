import { getDoc, incrementViews, type DocView } from "@/lib/store";
import { verifyPassword } from "@/lib/password";
import { isExpired } from "@/lib/ttl";
import { expiryPageHtml } from "@/lib/expiry-page";
import { lockPageHtml } from "@/lib/lock-page";
import { unlockToken, unlockCookieName, isValidUnlockCookie } from "@/lib/view-lock";
import { unlockRatelimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

const HTML = "text/html; charset=utf-8";
const NOINDEX = { "X-Robots-Tag": "noindex" };

function htmlResponse(body: string, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(body, { status, headers: { "Content-Type": HTML, ...NOINDEX, ...extraHeaders } });
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

async function serveContent(doc: DocView, id: string): Promise<Response> {
  const upstream = await fetch(doc.blobUrl);
  const html = await upstream.text();
  void incrementViews(id);
  return htmlResponse(html, 200);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const doc = await getDoc(id);

  if (!doc || isExpired(doc.expiresAt, Date.now())) {
    return htmlResponse(expiryPageHtml(), 410);
  }

  if (!doc.viewPasswordHash) {
    return serveContent(doc, id);
  }

  const cookieValue = readCookie(req, unlockCookieName(id));
  if (isValidUnlockCookie({ cookieValue, id, viewPasswordHash: doc.viewPasswordHash })) {
    return serveContent(doc, id);
  }

  return htmlResponse(lockPageHtml({ id }), 200);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const doc = await getDoc(id);

  if (!doc || isExpired(doc.expiresAt, Date.now())) {
    return htmlResponse(expiryPageHtml(), 410);
  }

  if (!doc.viewPasswordHash || !doc.viewSalt) {
    return htmlResponse("", 303, { Location: `/d/${id}` });
  }

  const { success } = await unlockRatelimit.limit(clientIp(req));
  if (!success) {
    return htmlResponse(lockPageHtml({ id, error: "요청이 너무 잦습니다. 잠시 후 다시 시도하세요." }), 429);
  }

  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  if (!verifyPassword(password, doc.viewPasswordHash, doc.viewSalt)) {
    return htmlResponse(lockPageHtml({ id, error: "비밀번호가 일치하지 않습니다." }), 401);
  }

  const token = unlockToken({ id, viewPasswordHash: doc.viewPasswordHash });
  const cookie = `${unlockCookieName(id)}=${token}; Path=/d/${id}; HttpOnly; SameSite=Lax; Secure`;
  return htmlResponse("", 303, { Location: `/d/${id}`, "Set-Cookie": cookie });
}
