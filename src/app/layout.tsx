import { Montserrat } from 'next/font/google';
import '../app.scss';

const montserrat = Montserrat({ subsets: ['latin'] });

export const metadata = {
  title: "Cuatro's Tracker",
  description: 'Games, Movies, Anime, Manga and Books Tracker for Me.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body className={montserrat.className}>{children}</body>
    </html>
  );
}
