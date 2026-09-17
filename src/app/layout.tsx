import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fog of War Monopoly",
  description: "A multiplayer property trading board game with hidden tiles and strategic blind buys",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
