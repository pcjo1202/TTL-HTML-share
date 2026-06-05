import { getDoc, extendDoc, deleteDoc } from "@/lib/store";
import { verifyPassword } from "@/lib/password";
import { isValidTtl } from "@/lib/ttl";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const { password, action, ttl } = (await req.json()) as {
    password?: string;
    action?: string;
    ttl?: string;
  };

  const doc = await getDoc(id);
  if (!doc) return Response.json({ error: "없는 문서입니다." }, { status: 404 });

  if (!password || !verifyPassword(password, doc.passwordHash, doc.salt)) {
    return Response.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 401 });
  }

  if (action === "delete") {
    await deleteDoc(id);
    return Response.json({ ok: true, action: "delete" });
  }

  if (action === "extend" && ttl && isValidTtl(ttl)) {
    await extendDoc(id, ttl, Date.now());
    return Response.json({ ok: true, action: "extend", ttl });
  }

  return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
}
