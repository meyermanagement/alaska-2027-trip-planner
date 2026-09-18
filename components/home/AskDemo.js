"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HERO_CONVERSATION } from "@/lib/home/heroConversation";

/**
 * The conversation on the front door, played rather than printed.
 *
 * A static answer card said the true thing -- that Aly answers out of your own
 * trip -- but it said it the way a screenshot does, and a screenshot of a chat
 * is indistinguishable from a paragraph of marketing copy. Watching the words
 * arrive is the whole argument: a person who has used any assistant knows the
 * difference between a reply that was written for them and a reply that was
 * written for everybody, and the only way to show it is to let them read it
 * being written.
 *
 * Three constraints shaped this.
 *
 * A crawler and a reader with no JavaScript must get the copy. So the first
 * render -- the one the server produces and the one that survives with scripts
 * off -- is the entire exchange, plainly visible, no animation attached. The
 * player only takes over in a layout effect, which runs before the browser
 * paints, so nobody sees the finished transcript flash past before it rewinds.
 *
 * Nobody may be trapped watching it. The card is a window with the transcript
 * running past it, and it follows the writing down at a walking pace rather
 * than jumping, but the window is a real scroll container: a reader can put a
 * finger on it and go back, and doing so takes the follower off their back
 * until they let go at the bottom again.
 *
 * Motion is a preference, not a given. Anybody who has asked their system for
 * less of it is handed the finished transcript, scrollable, with no typing, no
 * thinking pause and no follower.
 *
 * It has to wait its turn. The headline, the buttons and the beta line arrive
 * over the first half second, and a card that starts writing in the same
 * breath pulls the eye off the sentence that explains what is being looked at.
 * So the player takes the card over before the first paint, as it always did,
 * but it takes it over holding still: the first question is drawn in full and
 * nothing answers it. Writing begins once the card has been in view for a beat
 * and a further breath has passed, which on a laptop is the moment the hero
 * settles, and on a phone is the moment the reader scrolls down to it rather
 * than several seconds before they ever see it. The first question is never
 * typed, because it is the thing they are given to read while they wait; every
 * question after it is.
 *
 * The rests inside the run are long enough to be rests. A paragraph lands and
 * there is half a second before the next one starts, and a whole exchange ends
 * and there are four seconds before the next question is asked, which is the
 * difference between a script continuing and a person coming back.
 *
 * It is also shaped like a conversation rather than a document. The first
 * version set the question in bold and the reply in plain text, both flush
 * left in one column, which read as a heading followed by a paragraph -- a
 * person skimming it could not tell that two parties were speaking. So the
 * question is now a bubble on the right, where every messaging app on the
 * reader's phone puts the thing they said themselves, and everything Aly
 * writes is gathered into one bubble on the left under her name. The
 * paragraphs, the list of what to bring and the closing line all live inside
 * that single reply rather than floating as separate blocks, because they are
 * one answer and were always meant to be read as one.
 */

const CHAR_MS = 26; // questions, typed
const WORD_MS = 42; // answers, written
const ITEM_MS = 26; // list items, a little quicker
const THINK_MS = 620; // the pause before she starts
const BEAT_MS = 520; // between paragraphs
const TURN_MS = 4000; // between one exchange and the next
const SEEN_MS = 500; // in view this long before anything is allowed to move
const SEEN_PX = 160; // and this much of the card actually on screen
const LEAD_MS = 2600; // then the first question sits there, unanswered

/** The exchange flattened into the order the blocks are written in. */
function buildBlocks() {
  const blocks = [];
  for (const turn of HERO_CONVERSATION) {
    blocks.push({ kind: "stamp", turn: turn.id, text: turn.stamp });
    blocks.push({ kind: "question", turn: turn.id, text: turn.question });
    blocks.push({ kind: "think", turn: turn.id, text: "" });
    for (const paragraph of turn.answer) {
      blocks.push({ kind: "answer", turn: turn.id, text: paragraph });
    }
    if (turn.checklist) {
      blocks.push({
        kind: "checklistTitle",
        turn: turn.id,
        text: turn.checklist.title,
      });
      for (const item of turn.checklist.items) {
        blocks.push({ kind: "checklistItem", turn: turn.id, text: item });
      }
    }
    if (turn.tail) {
      blocks.push({ kind: "tail", turn: turn.id, text: turn.tail });
    }
  }
  return blocks;
}

const BLOCKS = buildBlocks();

/** Where the player waits: the first question drawn, the answer not started. */
const LEAD_AT = BLOCKS.findIndex((b) => b.kind === "think");

/** How a block is uncovered: by letter, by word, or all at once. */
function unitsOf(block) {
  if (block.kind === "question") {
    return { list: Array.from(block.text), step: CHAR_MS, join: "" };
  }
  if (block.kind === "answer" || block.kind === "tail") {
    return { list: block.text.split(" "), step: WORD_MS, join: " " };
  }
  if (block.kind === "checklistItem") {
    return { list: block.text.split(" "), step: ITEM_MS, join: " " };
  }
  return { list: [block.text], step: 0, join: "" };
}

function partial(block, shown) {
  const { list, join } = unitsOf(block);
  return list.slice(0, shown).join(join);
}

export default function AskDemo() {
  // Starts false so the server render, and a browser with scripts off, is the
  // finished transcript rather than an empty box.
  const [playing, setPlaying] = useState(false);
  // Armed and waiting is not the same as writing. The player takes the card
  // over before the first paint so the finished transcript never flashes, but
  // it holds still until the reader has had the card in front of them.
  const [started, setStarted] = useState(false);
  const [at, setAt] = useState(LEAD_AT); // which block is being written
  const [shown, setShown] = useState(0); // how much of it is written
  const [done, setDone] = useState(false);
  // The top of the window only fades once there is something above it. Fading
  // it from the start put the first line of the exchange behind a gradient.
  const [masked, setMasked] = useState(false);

  const cardRef = useRef(null);
  const scrollRef = useRef(null);
  const followRef = useRef(true);
  const mineRef = useRef(0);
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduced) return;
    setPlaying(true);
  }, []);

  // The starter. Nothing moves until the card has been on screen for a beat,
  // which on a laptop is the moment the hero settles and on a phone is the
  // moment the reader scrolls down to it rather than several seconds earlier.
  // Then the first question sits there unanswered for a breath, so the page
  // can be read before anything competes with it.
  useEffect(() => {
    if (!playing || started) return undefined;
    let lead = 0;
    let beat = 0;
    const begin = () => {
      if (lead) return;
      lead = setTimeout(() => setStarted(true), LEAD_MS);
    };
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      beat = setTimeout(begin, SEEN_MS);
      return () => {
        clearTimeout(beat);
        clearTimeout(lead);
      };
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        // A sliver at the bottom edge is not the reader looking at it. The
        // card while it waits is about two hundred pixels tall, and a phone
        // that shows seventy of them below the buttons has not shown it yet.
        const seen = entries.some(
          (e) =>
            e.isIntersecting &&
            e.intersectionRect.height >=
              Math.min(SEEN_PX, e.boundingClientRect.height),
        );
        if (seen && !beat) {
          beat = setTimeout(begin, SEEN_MS);
        } else if (!seen && !lead) {
          clearTimeout(beat);
          beat = 0;
        }
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
    );
    watcher.observe(node);
    return () => {
      watcher.disconnect();
      clearTimeout(beat);
      clearTimeout(lead);
    };
  }, [playing, started]);

  // The writer. One timer at a time, rescheduled as each unit lands, so a
  // component that unmounts mid-sentence leaves nothing running.
  useEffect(() => {
    if (!playing || !started || done) return undefined;
    const block = BLOCKS[at];
    if (!block) {
      setDone(true);
      return undefined;
    }
    const { list, step } = unitsOf(block);

    if (block.kind === "think") {
      const t = setTimeout(() => {
        setAt((n) => n + 1);
        setShown(0);
      }, THINK_MS);
      return () => clearTimeout(t);
    }

    if (shown >= list.length) {
      const gap = BLOCKS[at + 1]?.kind === "stamp" ? TURN_MS : BEAT_MS;
      const t = setTimeout(() => {
        setAt((n) => n + 1);
        setShown(0);
      }, gap);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => setShown((n) => n + 1), step || 1);
    return () => clearTimeout(t);
  }, [playing, started, done, at, shown]);

  // The follower. Eases the window down toward the newest line instead of
  // snapping. Our own scrolling fires scroll events too, so the handler has to
  // tell a reader's wheel from the follower's own nudge: the follower records
  // the value it just wrote, and any scrollTop that does not match it came
  // from a person. Without that, the first 0.35px the follower moved looked
  // like a reader scrolling up and it stood down permanently.
  useEffect(() => {
    if (!playing || !started) return undefined;
    const el = scrollRef.current;
    if (!el) return undefined;

    const tick = () => {
      const node = scrollRef.current;
      if (node && followRef.current) {
        const target = node.scrollHeight - node.clientHeight;
        const gap = target - node.scrollTop;
        if (gap > 0.5) {
          const next = node.scrollTop + Math.max(0.4, gap * 0.055);
          mineRef.current = next;
          node.scrollTop = next;
        }
      }
      if (node) {
        setMasked(node.scrollTop > 4);
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    const onScroll = () => {
      const node = scrollRef.current;
      if (!node) return;
      if (Math.abs(node.scrollTop - mineRef.current) < 2) return;
      const atBottom =
        node.scrollHeight - node.clientHeight - node.scrollTop < 28;
      followRef.current = atBottom;
      mineRef.current = node.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.cancelAnimationFrame(rafRef.current);
      el.removeEventListener("scroll", onScroll);
    };
  }, [playing, started]);

  const visible = playing ? BLOCKS.slice(0, at + 1) : BLOCKS;

  // Everything Aly writes in a turn is one reply, so consecutive blocks of
  // hers are gathered into a single bubble before anything is drawn. The
  // stamp, the question and the thinking dots stay on their own.
  const rendered = [];
  for (let i = 0; i < visible.length; i += 1) {
    const block = visible[i];
    const fromAly =
      block.kind === "answer" ||
      block.kind === "checklistTitle" ||
      block.kind === "checklistItem" ||
      block.kind === "tail";
    if (fromAly) {
      const open = rendered[rendered.length - 1];
      if (open && open.kind === "reply" && open.turn === block.turn) {
        open.parts.push({ block, index: i });
      } else {
        rendered.push({
          kind: "reply",
          turn: block.turn,
          parts: [{ block, index: i }],
        });
      }
    } else {
      rendered.push({ kind: block.kind, turn: block.turn, block, index: i });
    }
  }

  /** One paragraph of Aly's reply, drawn inside her bubble. */
  const replyPart = ({ block, index }) => {
    const live = playing && started && index === at;
    const text = live ? partial(block, shown) : block.text;
    const key = `${block.turn}-${block.kind}-${index}`;

    if (block.kind === "checklistTitle") {
      return (
        <p
          key={key}
          className="mt-4 text-[12px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "rgba(246,243,236,0.62)" }}
        >
          {text}
        </p>
      );
    }

    if (block.kind === "checklistItem") {
      return (
        <p
          key={key}
          className="home-ask-item mt-2 text-[14px] leading-relaxed"
          style={{ color: "rgba(246,243,236,0.92)" }}
        >
          {text}
        </p>
      );
    }

    return (
      <p
        key={key}
        className="mt-2.5 text-[14px] leading-relaxed"
        style={{
          color:
            block.kind === "tail"
              ? "rgba(246,243,236,0.74)"
              : "rgba(246,243,236,0.94)",
        }}
      >
        {text}
      </p>
    );
  };

  return (
    <div
      ref={cardRef}
      className="rounded-[var(--radius-card)] p-5"
      style={{
        background: "rgba(14,21,27,0.62)",
        border: "1px solid rgba(246,243,236,0.18)",
        backdropFilter: "blur(10px)",
      }}
    >
      {/* What this is, said before it plays rather than after. The line used to
          sit under the transcript, which meant a reader watched an answer
          arrive with no idea whether they were looking at a real session, a
          recording of one, or a piece of copy -- and only found out once they
          had finished reading. A caption at the foot of a thing that plays is a
          caption most people never reach. */}
      <div
        className="mb-4 border-b pb-3"
        style={{ borderColor: "rgba(246,243,236,0.16)" }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "rgba(246,243,236,0.62)" }}
        >
          An example conversation
        </p>
        <p
          className="mt-1.5 text-[12px] leading-relaxed"
          style={{ color: "rgba(246,243,236,0.58)" }}
        >
          A real answer is built from your own trip, your own travelers and your
          own wallet.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="home-ask-window"
        data-masked={masked ? "true" : "false"}
        aria-live="off"
        style={{
          maxHeight: playing ? "22rem" : "none",
          overflowY: playing ? "auto" : "visible",
        }}
      >
        {rendered.map((entry) => {
          if (entry.kind === "reply") {
            return (
              <div
                key={`reply-${entry.turn}`}
                className="home-ask-reply"
                data-turn={entry.turn}
              >
                <p className="home-ask-who">Aly</p>
                {entry.parts.map(replyPart)}
              </div>
            );
          }

          const block = entry.block;
          const i = entry.index;
          const live = playing && started && i === at;
          const text = live ? partial(block, shown) : block.text;
          const key = `${block.turn}-${block.kind}-${i}`;

          if (block.kind === "think") {
            return live ? (
              <p key={key} className="home-ask-think" aria-hidden="true">
                <span />
                <span />
                <span />
              </p>
            ) : null;
          }

          if (block.kind === "stamp") {
            return (
              <p key={key} className="home-ask-stamp">
                {text}
              </p>
            );
          }

          return (
            <p key={key} className="home-ask-said">
              {text}
              {live ? <span className="home-ask-caret" /> : null}
            </p>
          );
        })}
      </div>
    </div>
  );
}
