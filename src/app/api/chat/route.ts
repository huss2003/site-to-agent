import { ChatError, runChat } from "@/lib/chat";
import { getProviders } from "@/lib/providers";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    const result = await runChat({ store: getStore(), ...getProviders() }, body?.agentId, body?.messages);
    return Response.json(result);
  } catch (e) {
    const status = e instanceof ChatError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "chat failed" }, { status });
  }
}
