/**
 * The message, as it arrived, plus the one thing a verification message is for.
 *
 * The inbox used to show a subject line and a sender and nothing else, which is
 * fine for the mail it was built for -- a booking confirmation whose contents
 * become itinerary rows -- and useless for the mail that asks the reader a
 * question. Forwarding setup is the case that matters: Google writes to the
 * household address to check somebody agreed, so the person who has to agree can
 * only see that request here.
 *
 * Two things on this surface, in the order somebody needs them. The band comes
 * first when there is one, because a tester setting up forwarding wants to press
 * one thing, not read Google's boilerplate. The body comes second and is shown
 * verbatim, because the moment this component starts summarizing mail it becomes
 * something the reader has to trust, and the whole point is that they can read it
 * themselves.
 *
 * The body is plain text only. `html_body` is deliberately not rendered: putting
 * a stranger's markup into this page is the kind of thing that ends up in a
 * security review, and the messages that arrive without a text part are booking
 * confirmations whose useful contents are already parsed into rows above.
 */

/**
 * A URL turned into a link, everything else left as characters.
 *
 * Links matter here because the confirmation Google sends is a URL wrapped over
 * two lines, and a reader who cannot click it has to reassemble it by hand. The
 * split is done on the whole body rather than per line so the wrapped link is
 * rejoined before it is offered.
 */
function withLinks(text) {
  const parts = String(text).split(/(https?:\/\/[^\s<>"')]+)/g);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const href = part.replace(/[.,;:]+$/, "");
    const trailing = part.slice(href.length);
    return (
      <span key={i}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-all text-teal underline underline-offset-2 hover:text-ink"
        >
          {href}
        </a>
        {trailing}
      </span>
    );
  });
}

/**
 * What a verification message is actually asking, and the one press that answers
 * it.
 *
 * The address being confirmed is named rather than assumed, so somebody who
 * pasted the wrong address into Gmail sees the mismatch before approving. The
 * approve control is a plain link to the provider, not a fetch from this app:
 * Alyeska has no business holding a token that grants forwarding, and a link the
 * reader can see the destination of is the honest version of this button.
 */
function VerificationBand({ verification }) {
  const { provider, confirmUrl, code, address } = verification;
  if (!confirmUrl && !code) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-sand/60 p-3 text-sm text-ink-soft">
        This is a forwarding check from {provider}. Whatever it is asking for is
        in the message below.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-teal/30 bg-teal/[0.06] p-3">
      <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-teal">
        {provider} is checking you agreed
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        {address ? (
          <>
            Approving this lets mail be forwarded to{" "}
            <span className="break-all font-mono text-xs text-ink">
              {address}
            </span>
            , your household address.
          </>
        ) : (
          "Approving this lets mail be forwarded to your household address."
        )}{" "}
        Nothing is forwarded until you do.
      </p>

      {confirmUrl ? (
        <a
          href={confirmUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="btn btn-primary mt-3"
        >
          Approve it on {provider}
        </a>
      ) : null}

      {code ? (
        <div className="mt-3">
          <p className="text-xs text-ink-soft">
            {provider} wants this code pasted back into its forwarding settings:
          </p>
          <p className="mt-1 select-all font-mono text-lg tracking-[0.12em] text-ink">
            {code}
          </p>
        </div>
      ) : null}

      <p className="mt-2.5 text-xs text-ink-faint">
        {confirmUrl
          ? `Opens ${provider} in a new tab. If you did not set this up, read the message below and press nothing.`
          : "If you did not set this up, read the message below and enter nothing."}
      </p>
    </div>
  );
}

export default function InboxMessageBody({ text, verification = null }) {
  const said = (text || "").trim();

  return (
    <div className="space-y-3 border-t border-[var(--line)] bg-sand/30 p-4">
      {verification ? <VerificationBand verification={verification} /> : null}

      {said ? (
        <div className="max-h-96 overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-3">
          {/* Preformatted, because mail arrives with its own line breaks and a
              confirmation link that means something is split across two of them.
              Wrapping is on so a long line does not scroll sideways on a phone. */}
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink-soft">
            {withLinks(said)}
          </pre>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--line)] bg-white/60 p-3 text-sm text-ink-soft">
          This message arrived without a plain-text part, so there is nothing to
          show here. Anything Aly read out of it is above, and any attachments
          are on the trip once it is filed.
        </p>
      )}
    </div>
  );
}
