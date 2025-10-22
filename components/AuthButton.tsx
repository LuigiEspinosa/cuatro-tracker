"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";

export default function AuthButton() {
	const { data } = useSession();

	if (data?.user) {
		return (
			<div className="flex items-center gap-2">
				{data.user.image && (
					<Image
						src={data.user.image}
						alt="avatar"
						className="w-6 h-6 rounded-full"
						width={40}
						height={40}
					/>
				)}

				<span className="text-sm">{data.user.name ?? data.user.email}</span>
				<button onClick={() => signOut()} className="px-3 py-2 rounded bg-gray-800 text-white">
					Sign out
				</button>
			</div>
		);
	}

	return (
		<div className="flex gap-2">
			<button onClick={() => signIn("github")} className="px-3 py-2 rounded border">
				Sign in with GitHub
			</button>
			<button onClick={() => signIn("google")} className="px-3 py-2 rounded border">
				Sign in with Google
			</button>
		</div>
	);
}
