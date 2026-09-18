"use client";

export default function WalletAddButton() {
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => {
        window.dispatchEvent(new Event("wallet-add-program"));
        requestAnimationFrame(() => {
          const editor = document.getElementById("wallet-program-editor");
          editor?.scrollIntoView({ block: "start", behavior: "auto" });
          editor
            ?.querySelector("input, select, textarea")
            ?.focus({ preventScroll: true });
        });
      }}
    >
      Add a card or program
    </button>
  );
}
