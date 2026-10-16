import type { Metadata } from "next";
import "./globals.css";
import { idiomaAtual } from "@/lib/i18n/servidor";
import { ProvedorIdioma } from "@/lib/i18n/cliente";

export const metadata: Metadata = {
  title: "Painel Sendflow",
  description: "Inscrições da página de captura x membros do grupo de WhatsApp",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const idioma = await idiomaAtual();
  return (
    <html lang={idioma === "es" ? "es" : "pt-BR"} className="dark h-full antialiased">
      <body className="min-h-full">
        <ProvedorIdioma idioma={idioma}>{children}</ProvedorIdioma>
      </body>
    </html>
  );
}
