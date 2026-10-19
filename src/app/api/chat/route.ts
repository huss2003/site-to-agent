import { ChatError, runChat } from "@/lib/chat";
import { GuardError, rateLimit, readJson } from "@/lib/guard";
import { getProviders } from "@/lib/providers";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    rateLimit(req, "chat", Number(process.env.CHAT_RATE_LIMIT ?? 30), 60_000);
    const body = (await readJson(req, 32_768)) as { agentId?: unknown; messages?: unknown } | null;
    const result = await runChat({ store: getStore(), ...getProviders() }, body?.agentId, body?.messages);
    return Response.json(result);
  } catch (e) {
    const status = e instanceof ChatError || e instanceof GuardError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "chat failed" }, { status });
  }
}
