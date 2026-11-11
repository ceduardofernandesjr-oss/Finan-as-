import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FeedbackProvider } from "@/components/feedback";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: { default: "Finanças", template: "%s · Finanças" },
  description: "Gestão financeira pessoal: receitas, despesas, cartões, contas, dívidas, planejamento e relatórios.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Finanças", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#050605",
  width: "device-width",
  initialScale: 1,
  // comportamento de app: sem zoom de pinça nem de toque duplo
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Aplica o tema antes de pintar a tela (sem "piscar"). O escuro é o padrão da identidade visual;
// quem escolheu o claro no botão de tema continua no claro.
const themeScript = `(function(){var h=document.documentElement;try{var t=localStorage.getItem('tema');var d=t==='claro'?false:t==='auto'?window.matchMedia('(prefers-color-scheme: dark)').matches:true;if(d)h.classList.add('dark')}catch(e){h.classList.add('dark')}try{document.addEventListener('gesturestart',function(e){e.preventDefault()},{passive:false});document.addEventListener('touchmove',function(e){if(e.touches&&e.touches.length>1)e.preventDefault()},{passive:false});document.addEventListener('contextmenu',function(e){var t=e.target;if(!(t&&t.closest&&t.closest('input,textarea,select,[contenteditable=true]')))e.preventDefault()})}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // fundo escuro já no HTML (antes do CSS carregar): sem clarão branco ao abrir o app
    <html lang="pt-BR" suppressHydrationWarning style={{ backgroundColor: "#050605" }}>
      <head>
        <meta name="color-scheme" content="dark light" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <FeedbackProvider>{children}</FeedbackProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
