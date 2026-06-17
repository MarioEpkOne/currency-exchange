import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Currency Exchange',
  description: 'Live currency conversion with persistent usage statistics',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
