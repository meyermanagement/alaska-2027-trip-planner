"use client";

import { useEffect } from "react";

// Keep drafts in React memory, never in browser storage. Protect ordinary
// navigation and refresh; callers guard their own in-page close/switch controls.
export default function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // Chromium's Navigation API can cancel a same-document Back/Forward
    // before Next replaces the form. Never add synthetic history entries.
    const traverse = (event) => {
      if (event.navigationType !== "traverse" || !event.cancelable) return;
      if (
        !window.confirm(
          "Leave without saving your changes? Anything already saved will be kept.",
        )
      ) {
        event.preventDefault();
      }
    };
    const navigate = (event) => {
      const link = event.target.closest?.("a[href]");
      if (
        !link ||
        event.defaultPrevented ||
        link.target === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const url = new URL(link.href, window.location.href);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        link.hasAttribute("download")
      )
        return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;
      if (
        !window.confirm(
          "Leave without saving your changes? Anything already saved will be kept.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.navigation?.addEventListener("navigate", traverse);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.navigation?.removeEventListener("navigate", traverse);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
}
