import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FeedbackProvider } from "@/components/feedback";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: { default: "Finanças", template: "%s · Finanças" },
  description: "Gestão financeira pessoal: receitas, despesas, cartões, contas, dívidas, planejamento e relatórios.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Finanças", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#080e22" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Aplica o tema antes de pintar a tela (sem "piscar" claro → escuro).
const themeScript = `(function(){try{var t=localStorage.getItem('tema');var d=t?t==='escuro':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
