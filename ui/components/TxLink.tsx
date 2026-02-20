import { explorerTxUrl } from "@/lib/contracts";

interface TxLinkProps {
  hash: string;
  className?: string;
}

export function TxLink({ hash, className }: TxLinkProps) {
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-mono text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 ${className ?? ""}`}
    >
      {hash.slice(0, 10)}…{hash.slice(-6)}
    </a>
  );
}
