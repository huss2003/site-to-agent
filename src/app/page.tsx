import IngestForm from "@/components/IngestForm";
import { isDemo } from "@/lib/providers";

export const dynamic = "force-dynamic";

export default function Home() {
  return <IngestForm demo={isDemo()} />;
}
