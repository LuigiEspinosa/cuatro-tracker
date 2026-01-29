import "./globals.css";
import type { Metadata } from "next";
import AuthButton from "@/components/AuthButton";
import { Providers } from "@/components/Providers";
import Link from "next/link";

export const metadata: Metadata = { title: "Cuatro Tracker", description: "Track Everything!" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className="min-h-screen bg-gray-50 text-gray-900">
				<Providers>
					<header className="border-b bg-white">
						<div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
							<Link href="/" className="font-semibold">
								Cuatro Tracker
							</Link>
							<nav className="flex gap-3 items-center">
								<Link href="/tv" className="hover:underline">
									TV
								</Link>
								<Link href="/watchlist" className="hover:underline">
									My List
								</Link>
								<Link href="/search" className="hover:underline">
									Search
								</Link>
								<AuthButton />
							</nav>
						</div>
					</header>

					<main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
				</Providers>
			</body>
		</html>
	);
}
