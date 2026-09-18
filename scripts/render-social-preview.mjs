// Run after npm run build with an existing Playwright page. The committed PNG is
// served directly: messaging crawlers need neither JavaScript nor a login.
export async function renderSocialPreview(page) {
  const { readFile, readdir } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const logo = (await readFile(new URL("../logo/email-mark.svg", import.meta.url), "utf8"))
    .replaceAll("#0a7a6b", "#3fdfbe")
    .replaceAll("#175b78", "#7fb6e6")
    .replaceAll("#4b2bc4", "#c8a6ff")
    .replaceAll("#a5601a", "#efb35d");
  const emailSource = await readFile(new URL("../lib/email/wordmark.js", import.meta.url), "utf8");
  const tagline = emailSource.match(/HOUSE_TAGLINE = "([^"]+)"/)?.[1];
  if (!tagline) throw new Error("The email header tagline was not found.");
  const media = new URL("../.next/static/media/", import.meta.url);
  const latinFont = (await readdir(media)).find((name) => name.endsWith("-s.p.woff2"));
  if (!latinFont) throw new Error("Build the app first to supply its Geist Latin font.");
  const fontData = (await readFile(new URL(latinFont, media))).toString("base64");
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto("about:blank");
  await page.evaluate(async (data) => {
    const face = new FontFace("ShareGeist", `url(data:font/woff2;base64,${data})`, { weight: "100 900" });
    await face.load();
    document.fonts.add(face);
  }, fontData);
  const font = "ShareGeist, sans-serif";
  // Use the app's exact bundled Geist font, but none of its interactive UI.
  await page.evaluate(({ logo, tagline, font }) => {
    document.documentElement.dataset.skin = "aurora";
    document.body.innerHTML = "";
    const card = document.createElement("div");
    card.id = "social-preview";
    card.style.cssText = `position:fixed;inset:0;width:1200px;height:630px;overflow:hidden;background:#080c12;color:#e9eff3;font-family:${font};display:flex;align-items:center;justify-content:center;z-index:2147483647`;
    card.innerHTML = `
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 12% 0%,rgba(63,223,190,.10),transparent 62%),radial-gradient(ellipse at 100% 100%,rgba(200,166,255,.09),transparent 60%)"></div>
      <div style="position:relative;display:flex;align-items:center;gap:40px">
        <div style="width:164px;height:164px;flex:none">${logo}</div>
        <div>
          <div style="font-size:78px;line-height:1;font-weight:600;letter-spacing:.26em;color:#3fdfbe">ALYESKA</div>
          <div style="width:142px;height:2px;background:rgba(63,223,190,.45);margin-top:23px"></div>
          <div style="font-size:29px;line-height:1.35;font-weight:500;letter-spacing:-.005em;color:#b8c8d4;margin-top:22px;white-space:nowrap"><span style="font-weight:600;color:#e9eff3">Travel</span><span style="color:#3fdfbe"> · </span>${tagline}</div>
        </div>
      </div>`;
    card.querySelector("svg").style.cssText = "display:block;width:164px;height:164px";
    document.body.appendChild(card);
  }, { logo, tagline, font });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#social-preview").screenshot({
    path: fileURLToPath(new URL("../public/alyeska-share-midnight-v1.png", import.meta.url)),
    animations: "disabled",
  });
}
