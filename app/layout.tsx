import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent-Colab",
  description: "Shared project context hub for humans and their AI agents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
