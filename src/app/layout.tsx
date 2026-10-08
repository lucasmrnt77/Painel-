import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Painel Sendflow",
  description: "Inscrições da página de captura x membros do grupo de WhatsApp",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="dark h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
