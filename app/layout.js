import { Fraunces, Geist } from "next/font/google";
import "./globals.css";
import BootVeil from "@/components/BootVeil";

// One editorial serif for names and headings, one quiet sans for everything
// else. Loaded properly rather than falling back to whatever the device has.
const displayFace = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-face",
  display: "swap",
});

const sansFace = Geist({
  subsets: ["latin"],
  variable: "--font-sans-face",
  display: "swap",
});

export const metadata = {
  title: "Alyeska",
  description:
    "Shared itineraries, packing lists and pre-departure tasks for the family — with Aly along for the trip.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1b5a4c",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${displayFace.variable} ${sansFace.variable}`}>
      <body>
        {/* First in the body, so it is in the first frame of HTML the browser
            gets and there is no blank moment before it. It hides itself once
            the app underneath has painted -- see components/BootVeil.js. */}
        <BootVeil />
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
