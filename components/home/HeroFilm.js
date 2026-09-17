"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The moving picture behind the headline: a road, a town, a beach, a table at
 * sunset, and then round again.
 *
 * A still photograph of a coastline says "somewhere nice". Twenty-one seconds
 * of a family actually doing four ordinary things on a trip says what the
 * product is for, which is the trip itself rather than the destination. The
 * order is the order a day takes.
 *
 * Everything here is about not making a stranger pay for that. The still is
 * what renders first and what stays underneath forever: it is a real
 * background-image on the element below, so the hero is never blank, never
 * letterboxed and never waiting. The film is layered over it and only fades in
 * once the browser has told us it can play the whole thing without stopping.
 * If that never happens -- a slow connection, a browser that refuses to
 * autoplay, data saver switched on, a reader who has asked for less motion --
 * nothing is missing, because the thing underneath was never a placeholder.
 *
 * Phones get a smaller encode. It is picked once, at mount, from the width the
 * browser reports rather than from a media query on a <source>, because source
 * selection is only consulted on first load and a phone rotated into landscape
 * would otherwise start fetching four megabytes.
 */

const FILM = "/landing/maui-film.mp4";
const FILM_SMALL = "/landing/maui-film-sm.mp4";
const SMALL_ABOVE = 900;

export default function HeroFilm() {
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
      return;

    // Data saver is a direct request not to pull several megabytes of
    // decoration. Honor it the same way we honor reduced motion.
    const conn = navigator.connection;
    if (conn?.saveData) return;
    if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return;

    setSrc(window.innerWidth >= SMALL_ABOVE ? FILM : FILM_SMALL);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return undefined;

    // canplaythrough, not canplay: the point is to avoid starting something
    // that will stall a second later, which is more distracting than a still.
    const onReady = () => {
      const started = el.play();
      if (started?.catch) started.catch(() => {});
      setReady(true);
    };
    el.addEventListener("canplaythrough", onReady);
    el.load();
    return () => el.removeEventListener("canplaythrough", onReady);
  }, [src]);

  if (!src) return null;

  return (
    <video
      ref={ref}
      className="home-hero-film"
      data-ready={ready ? "true" : "false"}
      src={src}
      muted
      loop
      playsInline
      preload="auto"
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}
