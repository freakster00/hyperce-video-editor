import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyperce Editor",
  description: "Prompt-first AI video editor for Hyperce workflows"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
