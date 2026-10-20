import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catan Kart Oyunu | Online Multiplayer (3-4 Oyuncu)",
  description: "120 kartlık Catan Kutu Oyunu kurallarına birebir sadık, gerçek zamanlı çevrimiçi çok oyunculu kart oyunu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-[#140f0b] text-amber-50 antialiased selection:bg-amber-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
