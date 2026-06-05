import { sweepExpired } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const removed = await sweepExpired(Date.now());
  return Response.json({ removed: removed.length });
}
