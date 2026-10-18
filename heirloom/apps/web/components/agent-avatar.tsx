import { Avatar } from "@/components/ui/avatar";
import type { TeamId } from "@/lib/api";

// Transitional adapter; pages move to <Avatar team=…> as they are restyled.
export function AgentAvatar({ team, className }: { team: TeamId; className?: string }) {
  return <Avatar team={team} className={className} />;
}
