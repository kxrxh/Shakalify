import { getProcessStrength, normalizeIntensity } from "./shakalify";

export const POSTERIZE_MAX = 100;

export type EffectOptions = {
	posterize: number;
	noise: boolean;
	scanlines: boolean;
};

export const DEFAULT_EFFECTS: EffectOptions = {
	posterize: 0,
	noise: false,
	scanlines: false,
};

/** Maps slider 0–100 to color levels (0 = off, 100 ≈ 3 levels). */
export function getPosterizeSteps(amount: number): number {
	if (amount <= 0) return 0;
	const t = Math.min(POSTERIZE_MAX, Math.max(0, amount)) / POSTERIZE_MAX;
	const steps = Math.round(3 + (72 - 3) * (1 - t) ** 1.85);
	return Math.max(3, steps);
}

export function formatPosterizeLabel(amount: number): string {
	if (amount <= 0) return "Выкл";
	const steps = getPosterizeSteps(amount);
	return `${steps} отт.`;
}

function clampByte(value: number) {
	return Math.max(0, Math.min(255, value));
}

function quantize(value: number, steps: number) {
	const step = 255 / (steps - 1);
	return clampByte(Math.round(value / step) * step);
}

function pseudoNoise(x: number, y: number) {
	const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
	return n - Math.floor(n);
}

function applyPixelEffects(
	canvas: HTMLCanvasElement,
	level: number,
	effects: EffectOptions,
	minDimension?: number,
): void {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const strength = getProcessStrength(level, minDimension);
	const { width, height } = canvas;
	const imageData = ctx.getImageData(0, 0, width, height);
	const d = imageData.data;

	const posterizeSteps = getPosterizeSteps(effects.posterize);
	const noiseAmount = Math.round(strength * 70);

	for (let i = 0; i < d.length; i += 4) {
		let r = d[i];
		let g = d[i + 1];
		let b = d[i + 2];

		if (posterizeSteps > 0) {
			r = quantize(r, posterizeSteps);
			g = quantize(g, posterizeSteps);
			b = quantize(b, posterizeSteps);
		}

		if (effects.noise && noiseAmount > 0) {
			const px = (i / 4) % width;
			const py = Math.floor(i / 4 / width);
			const n = (pseudoNoise(px, py) - 0.5) * noiseAmount;
			r = clampByte(r + n);
			g = clampByte(g + n);
			b = clampByte(b + n);
		}

		d[i] = r;
		d[i + 1] = g;
		d[i + 2] = b;
	}

	ctx.putImageData(imageData, 0, 0);
}

function applyScanlines(
	canvas: HTMLCanvasElement,
	level: number,
	minDimension?: number,
): void {
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const strength = getProcessStrength(level, minDimension);
	const { width, height } = canvas;
	const gap = Math.max(2, Math.floor(5 - strength * 3));
	const alpha = 0.08 + strength * 0.35;

	ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
	for (let y = 0; y < height; y += gap * 2) {
		ctx.fillRect(0, y, width, gap);
	}
}

export function countActiveEffects(effects: EffectOptions): number {
	let count = 0;
	if (effects.posterize > 0) count++;
	if (effects.noise) count++;
	if (effects.scanlines) count++;
	return count;
}

export function applyEffects(
	canvas: HTMLCanvasElement,
	level: number,
	effects: EffectOptions,
	minDimension?: number,
): void {
	const intensity = normalizeIntensity(level);

	if (effects.posterize > 0 || effects.noise) {
		applyPixelEffects(canvas, intensity, effects, minDimension);
	}

	if (effects.scanlines) {
		applyScanlines(canvas, intensity, minDimension);
	}
}

export function upscaleNearest(
	canvas: HTMLCanvasElement,
	scale: number,
): HTMLCanvasElement {
	if (scale <= 1) return canvas;

	const scaled = document.createElement("canvas");
	scaled.width = canvas.width * scale;
	scaled.height = canvas.height * scale;
	const ctx = scaled.getContext("2d");
	if (!ctx) return canvas;

	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
	return scaled;
}
