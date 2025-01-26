"use client";

import Image from "next/image";
import Input from "@/app/components/Input";
import { SetStateAction, useCallback, useState } from "react";

interface InputEvent {
	target: {
		value: SetStateAction<string>;
	};
}

const Auth = () => {
	const [username, setUsername] = useState<string>("");
	const [email, setEmail] = useState<string>("");
	const [password, setPassword] = useState<string>("");

	const [variant, setVariant] = useState<string>("login");

	const toggleVariant = useCallback(() => {
		setVariant((currentVariant) => (currentVariant === "login" ? "register" : "login"));
	}, []);

	return (
		<div className="relative h-full w-full bg-[url('/images/hero.jpg')] bg-center bg-fixed bg-cover">
			<div className="bg-black w-full h-full lg:bg-opacity-50">
				<nav className="px-12 py-5">
					<Image
						src="/images/logo.png"
						alt="Cuatro Trakcer Logo in White"
						width={260}
						height={48}
					/>
				</nav>

				<div className="flex justify-center">
					<div className="bg-black bg-opacity-70 px-16 py-16 self-center mt-2 lg:w-2/5 lg:max-w-md rounded-md w-full">
						<h2 className="text-white text-4xl mb-8 font-semibold">
							{variant === "login" ? "Sign In" : "Register"}
						</h2>

						<div className="flex flex-col gap-4">
							{variant === "register" ? (
								<Input
									id="username"
									label="Name"
									type="text"
									value={username}
									onChange={(e: InputEvent) => setUsername(e.target.value)}
								/>
							) : null}

							<Input
								id="email"
								label="Email"
								type="email"
								value={email}
								onChange={(e: InputEvent) => setEmail(e.target.value)}
							/>

							<Input
								id="password"
								label="Password"
								type="password"
								value={password}
								onChange={(e: InputEvent) => setPassword(e.target.value)}
							/>
						</div>

						<button className="bg-red-600 py-3 text-white rounded-md w-full mt-10 hover:bg-red-700 transition">
							{variant === "login" ? "Login" : "Sign up"}
						</button>

						<p className="text-neutral-500 mt-12">
							{variant === "login" ? "First time?" : "Already have an Account?"}

							<span
								className="text-white ml-1 hover:underline cursor-pointer"
								onClick={toggleVariant}
							>
								{variant === "login" ? "Create an Account" : "Login"}
							</span>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Auth;
