"use client";

import { ASK_ALY_EVENT } from "@/components/AskAlyTrigger";
import { slotLabel } from "@/lib/travelers/slots";

/**
 * The button that starts an interview, on the person it is about.
 *
 * The interview has been running for a while with no way in: Aly would conduct
 * one if you asked her to in words, which means the one feature built to fill in
 * what nobody has told the app was reachable only by knowing it existed. So it
 * sits on the card, and it says how much of that person is still blank, because
 * "45% known" is the only thing that makes the button worth pressing twice.
 *
 * Opening it is the same event the Ask Aly button uses, with the person's id in
 * the focus and an opening message already written and sent -- there is nothing
 * for the family to type here, and a drawer that opened onto an empty box would
 * put the work back on them.
 */
export default function GetToKnow({ person, ledger, self = false }) {
  const known = ledger?.known ?? 0;
  const open = ledger?.open || [];
  const asking = ledger?.asking || [];
  const settled = ledger?.settled || [];
  const done = open.length === 0 && asking.length === 0;
  const first = person.name.split(" ")[0];

  const start = () => {
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: {
          focus: `interview:${person.id}`,
          seed: self
            ? "Get to know me. Ask me the next thing you need."
            : `Get to know ${first}. Ask the next thing you need, and I will answer for ${first} or hand her the phone.`,
          autoSend: true,
        },
      }),
    );
  };

  return (
    <div className="no-print mt-4 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
      {/* The button last in the row, so when a narrow screen wraps it lands
          under the lines it is a response to rather than between them. */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="section-label">What Aly knows</p>
          <p className="mt-0.5 text-sm text-ink">
            {known}% of the questions that change advice
            {settled.length > 0 && (
              <span className="text-ink-soft">
                {" "}
                · {settled.length} answered
              </span>
            )}
          </p>
          {/* Which blanks, by name. A percentage says how far there is to go;
              the names say what the next few minutes would be about. */}
          {open.length > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              Nothing yet on{" "}
              {open
                .slice(0, 5)
                .map((slot) => slotLabel(slot).toLowerCase())
                .join(", ")}
              {open.length > 5 ? `, and ${open.length - 5} more` : ""}.
            </p>
          )}
          {open.length === 0 && asking.length > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              Waiting on an answer about{" "}
              {asking.map((slot) => slotLabel(slot).toLowerCase()).join(", ")}.
            </p>
          )}
          {done && (
            <p className="mt-2 text-xs text-ink-soft">
              Every question has an answer or a reason for having none.
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary shrink-0"
          onClick={start}
        >
          {done
            ? self
              ? "Go over mine again"
              : `Go over ${first}'s again`
            : self
              ? "Get to know me"
              : `Get to know ${first}`}
        </button>
      </div>
    </div>
  );
}
