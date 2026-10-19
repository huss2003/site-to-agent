import { notFound } from "next/navigation";
import Chat from "@/components/Chat";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: { agentId: string };
  searchParams: { embed?: string };
}) {
  const agent = await getStore().getAgent(params.agentId);
  if (!agent) notFound();
  return <Chat agentId={agent.id} name={agent.name} url={agent.url} embed={searchParams.embed === "1"} />;
}
