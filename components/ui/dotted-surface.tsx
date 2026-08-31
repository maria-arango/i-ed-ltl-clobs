"use client";
// Source: 21st.dev sshahaider/dotted-surface, re-themed per DESIGN_SYSTEM.md §6.
// Changes from the original: next-themes and the dark branch removed (light
// only), cyan/white dots → hairline-strong on paper, prefers-reduced-motion
// renders a single static frame, aria-hidden (decorative). Landing/sign-in
// only — never behind a working screen (DESIGN_SYSTEM.md §5).

import { cn } from "@/lib/utils";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";

type DottedSurfaceProps = Omit<React.ComponentProps<"div">, "ref"> & {
	size?: number;
	opacity?: number;
	sizeAttenuation?: boolean;
};

// --clobs-hairline-strong #C9C0AC and --clobs-paper #FBF8F1 as 0–1 RGB.
const DOT_RGB = [201 / 255, 192 / 255, 172 / 255] as const;
const PAPER_HEX = 0xfbf8f1;

export function DottedSurface({
	className,
	size = 8,
	opacity = 0.8,
	sizeAttenuation = true,
	...props
}: DottedSurfaceProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const SEPARATION = 150;
		const AMOUNTX = 40;
		const AMOUNTY = 60;

		const scene = new THREE.Scene();
		scene.fog = new THREE.Fog(PAPER_HEX, 2000, 10000);

		const camera = new THREE.PerspectiveCamera(
			60,
			window.innerWidth / window.innerHeight,
			1,
			10000,
		);
		camera.position.set(0, 355, 1220);

		const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setClearColor(scene.fog.color, 0);
		container.appendChild(renderer.domElement);

		const positions: number[] = [];
		const colors: number[] = [];
		const geometry = new THREE.BufferGeometry();

		for (let ix = 0; ix < AMOUNTX; ix++) {
			for (let iy = 0; iy < AMOUNTY; iy++) {
				positions.push(
					ix * SEPARATION - (AMOUNTX * SEPARATION) / 2,
					0, // animated below
					iy * SEPARATION - (AMOUNTY * SEPARATION) / 2,
				);
				colors.push(...DOT_RGB);
			}
		}

		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(positions, 3),
		);
		geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

		const material = new THREE.PointsMaterial({
			size,
			vertexColors: true,
			transparent: true,
			opacity,
			sizeAttenuation,
		});

		const points = new THREE.Points(geometry, material);
		scene.add(points);

		const reduce = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		let animationId = 0;
		let count = 0;

		const setWave = () => {
			const arr = geometry.attributes.position.array as Float32Array;
			let i = 0;
			for (let ix = 0; ix < AMOUNTX; ix++) {
				for (let iy = 0; iy < AMOUNTY; iy++) {
					arr[i * 3 + 1] =
						Math.sin((ix + count) * 0.3) * 50 + Math.sin((iy + count) * 0.5) * 50;
					i++;
				}
			}
			geometry.attributes.position.needsUpdate = true;
		};

		const animate = () => {
			animationId = requestAnimationFrame(animate);
			setWave();
			renderer.render(scene, camera);
			count += 0.1;
		};

		const handleResize = () => {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
			if (reduce) renderer.render(scene, camera);
		};
		window.addEventListener("resize", handleResize);

		if (reduce) {
			// One static frame of the surface; no animation loop.
			setWave();
			renderer.render(scene, camera);
		} else {
			animate();
		}

		return () => {
			window.removeEventListener("resize", handleResize);
			cancelAnimationFrame(animationId);
			geometry.dispose();
			material.dispose();
			renderer.dispose();
			if (renderer.domElement.parentElement === container) {
				container.removeChild(renderer.domElement);
			}
		};
	}, [size, opacity, sizeAttenuation]);

	return (
		<div
			ref={containerRef}
			aria-hidden="true"
			className={cn("pointer-events-none fixed inset-0 -z-10", className)}
			{...props}
		/>
	);
}

export default DottedSurface;
