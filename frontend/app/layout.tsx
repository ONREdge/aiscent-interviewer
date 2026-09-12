import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AiSCENT — CX Maturity Interview',
  description: 'A short voice interview that produces your Ascent Position.',
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
