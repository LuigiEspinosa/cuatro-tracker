import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Cuatro Tracker",
	description: "Tracke Movies, Series, Games and More",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={"antialiased"}>{children}</body>
		</html>
	);
}
