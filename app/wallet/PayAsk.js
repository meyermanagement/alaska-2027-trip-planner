"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ASK_ALY_EVENT } from "@/components/AskAlyTrigger";

/**
 * Asking the Wallet a question, in your own words.
 *
 * What this replaces: the button used to drop five lines of instructions into
 * the Ask Aly box -- which card, which credit, points against cash, whether the
 * booking route changes the answer -- and leave the caret at the end of "What I
 * am booking: ". It read like being handed a form letter to sign, and every one
 * of those lines was already in the system prompt for this screen, so the
 * person was shown a second copy of something the server sends anyway.
 *
 * What it does instead: one box that takes anything. Most of the time the
 * question is about paying for something, so there are quick starts that write
 * a first sentence you can edit -- but they only ever fill the box, and the box
 * is never locked. "Is the Sapphire fee still worth it?" and "what could we do
 * with the Delta miles?" go through the same door as "the cruise deposit".
 *
 * The one fact worth asking for is the amount, because it is what decides
 * whether a statement credit covers the whole thing, and nothing on this screen
 * can guess it. It is optional, and when it is given it is appended as a plain
 * sentence rather than smuggled in, so the transcript reads like something a
 * person said.
 */

export const PAY_ASK_EVENT = "wallet-pay-ask";

/**
 * Quick starts, in the order the money usually goes out. Each one writes a
 * whole question rather than a category name, so pressing one and pressing Ask
 * is a complete thing to have said.
 */
const STARTERS = [
  { key: "flights", label: "Flights", said: "the best way to pay for flights" },
  { key: "hotel", label: "A hotel", said: "the best way to pay for a hotel" },
  {
    key: "cruise",
    label: "A cruise",
    said: "the best way to pay for a cruise",
  },
  { key: "car", label: "A car", said: "the best way to pay for a rental car" },
  {
    key: "dining",
    label: "Dinner out",
    said: "the best card to use for dinner out",
  },
  {
    key: "worth",
    label: "What these are worth",
    said: "what our points and miles are worth, and what we could do with them",
  },
  {
    key: "credits",
    label: "Credits we have not used",
    said: "which statement credits we are holding that we have not used this year",
  },
];

export default function PayAsk() {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState("");
  const [amount, setAmount] = useState("");
  const boxRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    function onAsk() {
      setSaid("");
      setAmount("");
      setOpen(true);
    }
    window.addEventListener(PAY_ASK_EVENT, onAsk);
    return () => window.removeEventListener(PAY_ASK_EVENT, onAsk);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes it, and the box takes the caret as it opens so somebody who
  // already had the sentence in their head can just type it.
  useEffect(() => {
    if (!open) return;
    function onKey(event) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    const held = window.setTimeout(() => boxRef.current?.focus(), 40);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(held);
    };
  }, [open, close]);

  function start(one) {
    setSaid(one.said);
    boxRef.current?.focus();
  }

  function ask(event) {
    event.preventDefault();
    const text = composeAsk(said, amount);
    if (!text) return;
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: { seed: text, autoSend: true, focus: "rewards" },
      }),
    );
  }

  if (!open) return null;

  const canAsk = said.trim().length >= 3;

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="arc-scrim absolute inset-0"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Ask how to pay"
        className="card relative m-0 w-full max-w-lg rounded-b-none rounded-t-3xl p-5 outline-none sm:m-4 sm:rounded-3xl"
        style={{
          maxHeight: "min(88vh, 40rem)",
          overflowY: "auto",
          paddingBottom:
            "max(1.25rem, calc(env(safe-area-inset-bottom) + 1rem))",
        }}
      >
        <form onSubmit={ask}>
          <h2 className="font-display text-xl font-semibold">Ask how to pay</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Name what you are buying, or ask anything else about these programs.
          </p>

          <label htmlFor="pay-ask-said" className="sr-only">
            What do you want to know?
          </label>
          <textarea
            ref={boxRef}
            id="pay-ask-said"
            value={said}
            onChange={(event) => setSaid(event.target.value)}
            rows={3}
            maxLength={600}
            placeholder="The best way to pay for the Alaska flights"
            className="field mt-4 w-full"
            required
          />

          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-ink-faint">
            Or start from one of these
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STARTERS.map((one) => (
              <button
                key={one.key}
                type="button"
                onClick={() => start(one)}
                className="chip"
              >
                {one.label}
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-semibold">
              Roughly how much, if you know
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
              It decides whether a credit you hold covers all of it.
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="1,400"
              className="field mt-2"
              style={{ maxWidth: "10rem" }}
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-sand-deep pt-4">
            <button
              type="submit"
              disabled={!canAsk}
              className="btn btn-primary px-4 py-2 text-sm"
            >
              Ask Aly
            </button>
            <button
              type="button"
              onClick={close}
              className="btn btn-ghost px-3 py-2 text-sm"
            >
              Not now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * What actually gets sent. The person's own words first, untouched -- a
 * question stays a question, a bare "the cruise deposit" stays that, and the
 * screen's own prompt teaches Aly to read a named purchase here as "how should
 * we pay for it". The amount, if there is one, is a second sentence in plain
 * English rather than a hidden field.
 */
export function composeAsk(said, amount) {
  const text = String(said || "")
    .trim()
    .replace(/\s+/g, " ");
  if (text.length < 3) return "";
  const money = moneyFrom(amount);
  if (!money) return text;
  const head = /[.!?]$/.test(text) ? text : `${text}.`;
  return `${head} It is about ${money}.`;
}

/** A typed amount as a dollar figure, or "" when there is nothing usable in it. */
function moneyFrom(amount) {
  const digits = String(amount || "").replace(/[^0-9.]/g, "");
  if (!digits) return "";
  const value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: value < 100 && value % 1 !== 0 ? 2 : 0,
  })}`;
}
