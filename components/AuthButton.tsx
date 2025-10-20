"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButton() {
	const { data } = useSession();

	if (data?.user) {
		return (
			<button onClick={() => signOut()} className="px-3 py-2 rounded bg-gray-800 text-white">
				Sign out
			</button>
		);
	}

	return (
		<button onClick={() => signIn("github")} className="px-3 py-2 rounded bg-blue-600 text-white">
			Sign in
		</button>
	);
}
