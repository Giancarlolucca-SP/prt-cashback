import "./globals.css";
import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth/auth-provider";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body"
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const themeScript = `
(function () {
  try {
    var stored = window.localStorage.getItem("gt3-crm-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export const metadata: Metadata = {
  title: "GT3 CRM",
  description: "Base MVP do CRM automotivo da GT3"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`${manrope.variable} ${spaceGrotesk.variable}`} lang="pt-BR" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
