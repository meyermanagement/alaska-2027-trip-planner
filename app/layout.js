import "./globals.css";

export const metadata = {
  title: "Meyer Family Travel",
  description:
    "Shared itineraries, packing lists and pre-departure tasks for the Meyer family.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f5f57",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
