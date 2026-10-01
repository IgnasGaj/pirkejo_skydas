import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pirkėjo Skydas",
  description: "Žinok savo teises po kiekvieno pirkimo."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="lt"><body>{children}</body></html>;
}
