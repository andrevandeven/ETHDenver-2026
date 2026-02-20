import { RFQ_STATUS } from "@/lib/contracts";

const COLORS: Record<number, string> = {
  0: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  1: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  2: "bg-green-500/20 text-green-300 border-green-500/30",
  3: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export function StatusBadge({ status }: { status: number }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${COLORS[status] ?? COLORS[3]}`}
    >
      {RFQ_STATUS[status] ?? "Unknown"}
    </span>
  );
}
