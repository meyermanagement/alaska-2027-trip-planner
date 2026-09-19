"use client";

import { useState } from "react";
import { walletInitials, walletLogo } from "@/lib/wallet-logos";

export default function WalletLogo({ program }) {
  const logo = walletLogo(program);
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = logo && logo.src !== failedSrc;
  return (
    <span aria-hidden="true" data-wallet-logo={showImage ? "artwork" : "fallback"}
      className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--line)] p-1.5"
      style={{ background: showImage ? (logo.dark ? "#172c3e" : "#ffffff") : "var(--sand-deep)" }}>
      {showImage ? (
        // Local, pre-sized WebP images; native error handling guarantees a fallback.
        <img src={logo.src} alt="" width="320" height="200" decoding="async"
          ref={(image) => {
            // An SSR image can fail before React attaches its error listener.
            if (image?.complete && image.naturalWidth === 0) setFailedSrc(logo.src);
          }}
          className="h-full w-full object-contain" onError={() => setFailedSrc(logo.src)} />
      ) : (
        <span className="text-sm font-semibold text-ink-soft">{walletInitials(program)}</span>
      )}
    </span>
  );
}
