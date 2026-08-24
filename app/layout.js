import "./globals.css";

export const metadata = {
  title: "Alyeska",
  description:
    "Shared itineraries, packing lists and pre-departure tasks for the family — with Aly along for the trip.",
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
