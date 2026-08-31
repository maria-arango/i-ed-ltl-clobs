"use client";
// Source: 21st.dev aghasisahakyan1/sign-in-flow-1, re-themed per
// DESIGN_SYSTEM.md §6. Stripped from the original: marketing navbar
// (Manifesto/Careers/Discover), Google sign-in, all legal boilerplate,
// placeholder copy, black background and cyan/white dot matrix, pill buttons.
// Re-themed: paper canvas, hairline-strong dots, ink text, bark primary,
// 10px control radius, Newsreader display heading, token durations/easing,
// reduced-motion branch (no canvas animation, no slide).
//
// This is the visual shell only: the email/code flow is presentational and
// is wired to real Auth.js one-time codes in build stage 1 via the
// onSubmitEmail / onVerifyCode / onContinue props.

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Dot-matrix reveal (decorative)                                      */
/* ------------------------------------------------------------------ */

// --clobs-hairline-strong (#C9C0AC) as 0–255 RGB for the shader.
const DOT_COLOR: [number, number, number] = [201, 192, 172];

type Uniforms = Record<
	string,
	{ value: number[] | number[][] | number; type: string }
>;

const ShaderMaterialMesh = ({
	source,
	uniforms,
}: {
	source: string;
	uniforms: Uniforms;
}) => {
	const { size } = useThree();
	const ref = useRef<THREE.Mesh>(null);

	useFrame(({ clock }) => {
		if (!ref.current) return;
		const material = ref.current.material as THREE.ShaderMaterial;
		material.uniforms.u_time.value = clock.getElapsedTime();
	});

	const material = React.useMemo(() => {
		const prepared: Record<string, { value: unknown }> = {};
		for (const name in uniforms) {
			const u = uniforms[name];
			switch (u.type) {
				case "uniform1f":
				case "uniform1i":
				case "uniform1fv":
					prepared[name] = { value: u.value };
					break;
				case "uniform3fv":
					prepared[name] = {
						value: (u.value as number[][]).map((v) =>
							new THREE.Vector3().fromArray(v),
						),
					};
					break;
				default:
					prepared[name] = { value: u.value };
			}
		}
		prepared.u_time = { value: 0 };
		prepared.u_resolution = {
			value: new THREE.Vector2(size.width * 2, size.height * 2),
		};

		return new THREE.ShaderMaterial({
			vertexShader: `
      precision mediump float;
      uniform vec2 u_resolution;
      out vec2 fragCoord;
      void main(){
        gl_Position = vec4(position.x, position.y, 0.0, 1.0);
        fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
        fragCoord.y = u_resolution.y - fragCoord.y;
      }
      `,
			fragmentShader: source,
			uniforms: prepared as unknown as { [key: string]: THREE.IUniform },
			glslVersion: THREE.GLSL3,
			blending: THREE.CustomBlending,
			blendSrc: THREE.SrcAlphaFactor,
			blendDst: THREE.OneFactor,
		});
	}, [size.width, size.height, source, uniforms]);

	return (
		<mesh ref={ref}>
			<planeGeometry args={[2, 2]} />
			<primitive object={material} attach="material" />
		</mesh>
	);
};

const DotMatrix = ({
	colors = [DOT_COLOR],
	opacities = [0.04, 0.04, 0.04, 0.04, 0.04, 0.08, 0.08, 0.08, 0.08, 0.14],
	totalSize = 20,
	dotSize = 2,
	reverse = false,
}: {
	colors?: number[][];
	opacities?: number[];
	totalSize?: number;
	dotSize?: number;
	reverse?: boolean;
}) => {
	const uniforms = React.useMemo<Uniforms>(() => {
		let colorsArray = Array<number[]>(6).fill(colors[0]);
		if (colors.length === 2) {
			colorsArray = [
				colors[0],
				colors[0],
				colors[0],
				colors[1],
				colors[1],
				colors[1],
			];
		} else if (colors.length === 3) {
			colorsArray = [
				colors[0],
				colors[0],
				colors[1],
				colors[1],
				colors[2],
				colors[2],
			];
		}
		return {
			u_colors: {
				value: colorsArray.map((c) => [c[0] / 255, c[1] / 255, c[2] / 255]),
				type: "uniform3fv",
			},
			u_opacities: { value: opacities, type: "uniform1fv" },
			u_total_size: { value: totalSize, type: "uniform1f" },
			u_dot_size: { value: dotSize, type: "uniform1f" },
			u_reverse: { value: reverse ? 1 : 0, type: "uniform1i" },
		};
	}, [colors, opacities, totalSize, dotSize, reverse]);

	return (
		<Canvas className="absolute inset-0 h-full w-full">
			<ShaderMaterialMesh
				uniforms={uniforms}
				source={`
        precision mediump float;
        in vec2 fragCoord;

        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        uniform int u_reverse;

        out vec4 fragColor;

        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) {
            return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
        }

        void main() {
            vec2 st = fragCoord.xy;
            st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
            st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));

            float opacity = step(0.0, st.x);
            opacity *= step(0.0, st.y);

            vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

            float frequency = 5.0;
            float show_offset = random(st2);
            float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
            opacity *= u_opacities[int(rand * 10.0)];
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

            vec3 color = u_colors[int(show_offset * 6.0)];

            float animation_speed_factor = 0.5;
            vec2 center_grid = u_resolution / 2.0 / u_total_size;
            float dist_from_center = distance(center_grid, st2);

            float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);
            float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
            float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);

            if (u_reverse == 1) {
                opacity *= 1.0 - step(timing_offset_outro, u_time * animation_speed_factor);
                opacity *= clamp((step(timing_offset_outro + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            } else {
                opacity *= step(timing_offset_intro, u_time * animation_speed_factor);
                opacity *= clamp((1.0 - step(timing_offset_intro + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            }

            fragColor = vec4(color, opacity);
            fragColor.rgb *= fragColor.a;
        }`}
			/>
		</Canvas>
	);
};

export const CanvasRevealEffect = ({
	containerClassName,
	dotSize = 3,
	reverse = false,
	showGradient = true,
}: {
	containerClassName?: string;
	dotSize?: number;
	reverse?: boolean;
	showGradient?: boolean;
}) => (
	<div
		aria-hidden="true"
		className={cn("relative h-full w-full", containerClassName)}
	>
		<div className="h-full w-full">
			<DotMatrix
				colors={[DOT_COLOR, DOT_COLOR]}
				dotSize={dotSize}
				opacities={[0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1]}
				reverse={reverse}
			/>
		</div>
		{showGradient && (
			// Vignette of the decorative dot field into the paper canvas.
			<div className="absolute inset-0 bg-gradient-to-t from-paper to-transparent" />
		)}
	</div>
);

/* ------------------------------------------------------------------ */
/* Sign-in page                                                        */
/* ------------------------------------------------------------------ */

export interface SignInPageProps {
	className?: string;
	/** Called with the email; return false to stay on the email step. */
	onSubmitEmail?: (email: string) => boolean | Promise<boolean>;
	/** Called with the 6-digit code; return false to reject it. */
	onVerifyCode?: (code: string) => boolean | Promise<boolean>;
	/** Called when the signed-in user continues. */
	onContinue?: () => void;
	/** Shown under the email form, e.g. "This email is not on the team list." */
	emailError?: string | null;
	/** Shown under the code inputs, e.g. "That code is wrong or expired." */
	codeError?: string | null;
}

export const SignInPage = ({
	className,
	onSubmitEmail,
	onVerifyCode,
	onContinue,
	emailError,
	codeError,
}: SignInPageProps) => {
	const reduce = useReducedMotion();
	const [email, setEmail] = useState("");
	const [step, setStep] = useState<"email" | "code" | "success">("email");
	const [code, setCode] = useState(["", "", "", "", "", ""]);
	const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const [initialCanvasVisible, setInitialCanvasVisible] = useState(true);
	const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false);

	// Step slide: --clobs-dur-page + --clobs-ease-out; nothing under reduce.
	const stepTransition = reduce
		? { duration: 0 }
		: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

	const handleEmailSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) return;
		if (onSubmitEmail && (await onSubmitEmail(email)) === false) return;
		setStep("code");
	};

	useEffect(() => {
		if (step === "code") {
			const t = setTimeout(() => codeInputRefs.current[0]?.focus(), 300);
			return () => clearTimeout(t);
		}
	}, [step]);

	const completeSignIn = () => {
		setReverseCanvasVisible(true);
		setTimeout(() => setInitialCanvasVisible(false), 50);
		setTimeout(() => setStep("success"), reduce ? 0 : 1200);
	};

	const handleCodeChange = async (index: number, value: string) => {
		if (value.length > 1) return;
		const newCode = [...code];
		newCode[index] = value;
		setCode(newCode);

		if (value && index < 5) codeInputRefs.current[index + 1]?.focus();

		if (index === 5 && value && newCode.every((d) => d.length === 1)) {
			const joined = newCode.join("");
			if (onVerifyCode && (await onVerifyCode(joined)) === false) {
				setCode(["", "", "", "", "", ""]);
				codeInputRefs.current[0]?.focus();
				return;
			}
			completeSignIn();
		}
	};

	const handleKeyDown = (
		index: number,
		e: React.KeyboardEvent<HTMLInputElement>,
	) => {
		if (e.key === "Backspace" && !code[index] && index > 0) {
			codeInputRefs.current[index - 1]?.focus();
		}
	};

	const handleBackClick = () => {
		setStep("email");
		setCode(["", "", "", "", "", ""]);
		setReverseCanvasVisible(false);
		setInitialCanvasVisible(true);
	};

	return (
		<div
			className={cn(
				"relative flex min-h-screen w-full flex-col bg-paper",
				className,
			)}
		>
			{/* Decorative reveal — skipped entirely under reduced motion. */}
			{!reduce && (
				<div className="absolute inset-0 z-0" aria-hidden="true">
					{initialCanvasVisible && (
						<div className="absolute inset-0">
							<CanvasRevealEffect containerClassName="bg-paper" dotSize={6} />
						</div>
					)}
					{reverseCanvasVisible && (
						<div className="absolute inset-0">
							<CanvasRevealEffect
								containerClassName="bg-paper"
								dotSize={6}
								reverse
							/>
						</div>
					)}
				</div>
			)}

			<div className="relative z-10 flex flex-1 flex-col items-center justify-center p-6">
				<div className="w-full max-w-sm">
					<AnimatePresence mode="wait">
						{step === "email" ? (
							<motion.div
								key="email-step"
								initial={{ opacity: 0, x: reduce ? 0 : -40 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: reduce ? 0 : -40 }}
								transition={stepTransition}
								className="space-y-8 text-center"
							>
								<div className="space-y-3">
									<h1
										className="font-serif text-ink"
										style={{
											fontSize: "var(--clobs-text-display-lg)",
											lineHeight: "var(--clobs-leading-display-lg)",
											letterSpacing: "var(--clobs-tracking-display-lg)",
										}}
									>
										LTL Classroom Observations
									</h1>
									<p className="text-[17px] text-graphite">
										Sign in with your work email
									</p>
								</div>

								<form onSubmit={handleEmailSubmit} className="space-y-3">
									<label htmlFor="signin-email" className="sr-only">
										Work email
									</label>
									<input
										id="signin-email"
										type="email"
										autoComplete="email"
										placeholder="name@organisation.org"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										required
										className="w-full rounded-md border border-hairline bg-paper px-4 py-3 text-center text-[15px] text-ink placeholder:text-ash focus:border-hairline-strong"
									/>
									<button
										type="submit"
										className="w-full rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
									>
										Email me a code
									</button>
									{emailError && (
										<p role="alert" className="text-[14px] text-clay">
											{emailError}
										</p>
									)}
								</form>
							</motion.div>
						) : step === "code" ? (
							<motion.div
								key="code-step"
								initial={{ opacity: 0, x: reduce ? 0 : 40 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: reduce ? 0 : 40 }}
								transition={stepTransition}
								className="space-y-8 text-center"
							>
								<div className="space-y-2">
									<h1
										className="font-serif text-ink"
										style={{
											fontSize: "var(--clobs-text-display)",
											lineHeight: "var(--clobs-leading-display)",
											letterSpacing: "var(--clobs-tracking-display)",
										}}
									>
										We sent you a code
									</h1>
									<p className="text-[15px] text-graphite">
										Enter the six digits from the email sent to{" "}
										<span className="font-medium text-ink">{email}</span>
									</p>
								</div>

								<div
									className="flex items-center justify-center gap-2"
									role="group"
									aria-label="Six-digit sign-in code"
								>
									{code.map((digit, i) => (
										<input
											key={i}
											ref={(el) => {
												codeInputRefs.current[i] = el;
											}}
											type="text"
											inputMode="numeric"
											pattern="[0-9]*"
											maxLength={1}
											value={digit}
											aria-label={`Digit ${i + 1}`}
											onChange={(e) => handleCodeChange(i, e.target.value)}
											onKeyDown={(e) => handleKeyDown(i, e)}
											className="mono h-12 w-10 rounded-md border border-hairline bg-sunken text-center text-[20px] text-ink focus:border-hairline-strong"
										/>
									))}
								</div>

								{codeError && (
									<p role="alert" className="text-[14px] text-clay">
										{codeError}
									</p>
								)}

								<div className="space-y-4">
									<button
										type="button"
										className="rounded-sm text-[14px] text-lake underline underline-offset-4"
									>
										Resend code
									</button>
									<div className="flex w-full gap-3">
										<button
											type="button"
											onClick={handleBackClick}
											className="w-[30%] rounded-md border border-hairline-strong bg-paper px-[18px] py-[10px] text-[15px] font-semibold text-ink transition-colors duration-[90ms] hover:bg-card active:scale-[0.98]"
										>
											Back
										</button>
										<button
											type="button"
											disabled={!code.every((d) => d !== "")}
											className="flex-1 rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ash"
										>
											Continue
										</button>
									</div>
								</div>
							</motion.div>
						) : (
							<motion.div
								key="success-step"
								initial={{ opacity: 0, y: reduce ? 0 : 24 }}
								animate={{ opacity: 1, y: 0 }}
								transition={stepTransition}
								className="space-y-8 text-center"
							>
								<div className="space-y-2">
									<h1
										className="font-serif text-ink"
										style={{
											fontSize: "var(--clobs-text-display)",
											lineHeight: "var(--clobs-leading-display)",
											letterSpacing: "var(--clobs-tracking-display)",
										}}
									>
										Signed in
									</h1>
									<p className="text-[15px] text-graphite">Welcome back.</p>
								</div>

								<div className="py-6">
									<div className="mx-auto flex size-16 items-center justify-center rounded-full bg-forest-wash">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											className="size-8 text-forest"
											viewBox="0 0 20 20"
											fill="currentColor"
											aria-hidden="true"
										>
											<path
												fillRule="evenodd"
												d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
												clipRule="evenodd"
											/>
										</svg>
									</div>
								</div>

								<button
									type="button"
									onClick={onContinue}
									className="w-full rounded-md bg-bark px-[18px] py-[10px] text-[15px] font-semibold text-paper transition-colors duration-[90ms] hover:bg-bark-deep active:scale-[0.98]"
								>
									Continue
								</button>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
};

export default SignInPage;
