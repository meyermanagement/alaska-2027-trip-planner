import { historyRetentionEnabled } from "@/lib/retention/history";

export default function HistoryRetentionNotice({ inbox = false }) {
  if (!historyRetentionEnabled()) return null;
  return <p className="mt-2 text-sm leading-relaxed text-ink-faint">
    Completed history is automatically removed after 90 days. Active items and saved trip information are kept.
    {inbox ? " Original email text is kept for 30 days; forward it again if you need another reading after that." : ""}
  </p>;
}
