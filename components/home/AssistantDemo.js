/**
 * The From your assistant scene: one exchange held in an outside assistant
 * connected to Alyeska over MCP, drawn in the page's own bubbles rather than a
 * copy of any assistant's screen. The assistant is named in words only.
 *
 * It ends on the confirmation, because that is the difference between this and
 * a data export: the assistant reads the trip, and nothing on it changes until
 * the person says yes. Same invented family and Tuesday as the other scenes;
 * no child's items and nothing about health, which the connection never shares.
 * The choices are spans, as elsewhere on this page: nothing here goes anywhere.
 */
export default function AssistantDemo() {
  return (
    <div className="ma-fade home-notice-scene relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] p-3 sm:p-6">
      <img
        src="/landing/maui-film-poster.jpg"
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 block h-full w-full object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0" style={{ background: "rgba(8,14,19,0.62)" }} />
      <div className="relative">
        <p className="home-ask-stamp" style={{ marginTop: 0 }}>In Claude · Monday, 8:10 pm</p>
        <p className="home-ask-said">What do we need for the snorkel boat tomorrow?</p>
        <div className="home-ask-reply">
          <p className="home-ask-who">Claude, from Alyeska</p>
          <p className="text-[15px] leading-relaxed" style={{ color: "rgba(246,243,236,0.92)" }}>
            The 8:20 boat at Mākena, with check-in at 7:50. Tuesday&rsquo;s day pack already has photo ID, cash for the balance, water and snacks.
          </p>
        </div>
        <p className="home-ask-said">Add reef-safe sunscreen.</p>
        <div className="home-notice mt-3" data-level="low">
          <div className="flex items-center justify-between gap-3">
            <span className="home-notice-app">
              <img src="/alyeska-touch.png" alt="" width="20" height="20" />
              <span>Alyeska · <span className="home-notice-tag">Confirm</span></span>
            </span>
          </div>
          <p className="home-notice-title">Add reef-safe sunscreen to Tuesday&rsquo;s day pack?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="home-nudge-act" data-act="on">Add it</span>
            <span className="home-nudge-act">Not now</span>
          </div>
        </div>
        <div className="home-ask-reply">
          <p className="text-[15px] leading-relaxed" style={{ color: "rgba(246,243,236,0.92)" }}>
            Added. It is on Tuesday&rsquo;s day pack in Alyeska.
          </p>
        </div>
      </div>
    </div>
  );
}
