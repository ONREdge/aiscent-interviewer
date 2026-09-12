import { Poppins, Space_Grotesk } from 'next/font/google';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-poppins',
  display: 'swap',
});

const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

interface AiscentLayoutProps {
  children: React.ReactNode;
}

export default function AiscentLayout({ children }: AiscentLayoutProps) {
  return (
    <div
      className={`${poppins.variable} ${grotesk.variable} aiscent-theme min-h-screen`}
    >
      {children}
    </div>
  );
}
