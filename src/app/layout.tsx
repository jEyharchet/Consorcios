import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Administración de Consorcios',
  description: 'Base del proyecto web para administración de consorcios.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
