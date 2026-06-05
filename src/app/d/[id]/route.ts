import { getDoc, incrementViews } from "@/lib/store";
import { isExpired } from "@/lib/ttl";
import { expiryPageHtml } from "@/lib/expiry-page";

export const runtime = "nodejs";

const NOINDEX = { "X-Robots-Tag": "noindex" };

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const doc = await getDoc(id);

  if (!doc || isExpired(doc.expiresAt, Date.now())) {
    return new Response(expiryPageHtml(), {
      status: 410,
      headers: { "Content-Type": "text/html; charset=utf-8", ...NOINDEX },
    });
  }

  const upstream = await fetch(doc.blobUrl);
  const html = await upstream.text();
  void incrementViews(id);

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...NOINDEX },
  });
}
