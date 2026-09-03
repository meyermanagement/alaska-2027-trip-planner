"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SKIN, skinOr } from "@/lib/skins";

/**
 * Which skin the page is wearing, as React state.
 *
 * Almost nothing needs this. The skin is a set of custom properties on <html>,
 * so every card, chip and button follows it without being told. The exception is
 * anything that has to resolve a color to a literal string -- the trip coast is
 * drawn into an SVG data URI, which is its own document with no :root to read --
 * and those things need to be told when to redraw.
 *
 * Reads the attribute rather than the profile row, so it is right on the first
 * render (the attribute is set by a blocking script in the document head) and
 * follows a change made in another tab through the MutationObserver below.
 */
export function useSkin() {
  const [skin, setSkin] = useState(DEFAULT_SKIN);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setSkin(skinOr(root.dataset.skin));
    read();
    const watch = new MutationObserver(read);
    watch.observe(root, { attributes: true, attributeFilter: ["data-skin"] });
    return () => watch.disconnect();
  }, []);

  return skin;
}
