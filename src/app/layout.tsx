import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Display: expressive grotesk with optical size + width axes for heavy, tight headings.
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], axes: ["opsz", "wdth"] });
// Body: high-legibility humanist sans. Mono: ids, counts, eyebrows.
const body = IBM_Plex_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "+twe AI Interviewer",
  description: "Face-to-face AI video interviews with tailored questions and grounded recruiter reports.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
