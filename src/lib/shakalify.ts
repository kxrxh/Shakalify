import {
	applyEffects,
	countActiveEffects,
	DEFAULT_EFFECTS,
	type EffectOptions,
	upscaleNearest,
} from "./effects";

function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url =
			typeof source === "string" ? source : URL.createObjectURL(source);

		img.onload = () => {
			if (typeof source !== "string") URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			if (typeof source !== "string") URL.revokeObjectURL(url);
			reject(new Error("Failed to load image"));
		};
		img.src = url;
	});
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	quality: number,
	type: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
			type,
			type === "image/jpeg" ? quality : undefined,
		);
	});
}

export type ShakalStats = {
	passes: number;
	quality: number;
	minDimension: number;
	pixelsMurdered: number;
	effectsApplied: number;
	pixelScale: number;
};

export type ShakalOptions = {
	effects?: EffectOptions;
	pixelScale?: number;
	exportPng?: boolean;
};

export const INTENSITY_MIN = 0;
export const INTENSITY_MAX = 100;
export const INTENSITY_PROCESS_FULL_AT = 75;
export const DEFAULT_INTENSITY = 67;

export const LEGACY_METER_STAGES = 9;

export function legacyStageToIntensity(stage: number): number {
	const level = Math.min(LEGACY_METER_STAGES, Math.max(1, Math.round(stage)));
	return ((level - 1) / (LEGACY_METER_STAGES - 1)) * INTENSITY_MAX;
}

export function intensityToLegacyStage(intensity: number): number {
	const v = normalizeIntensity(intensity);
	if (v <= 0) return 1;
	return Math.min(
		LEGACY_METER_STAGES,
		Math.max(
			1,
			Math.round(1 + (v / INTENSITY_MAX) * (LEGACY_METER_STAGES - 1)),
		),
	);
}

export function normalizeIntensity(level: number): number {
	return Math.min(INTENSITY_MAX, Math.max(INTENSITY_MIN, level));
}

export function toProcessIntensity(sliderValue: number): number {
	const v = normalizeIntensity(sliderValue);
	if (v <= 0) return 0;
	return (v / INTENSITY_MAX) * INTENSITY_PROCESS_FULL_AT;
}

export function formatIntensityLabel(level: number): string {
	const v = Math.round(normalizeIntensity(level));
	if (v <= 0) return "Оригинал";
	return `${v}%`;
}

export type ShakalMode = "meter" | "process" | "meter-legacy";

const LEGACY_METER_SCALE = 0.5;
const LEGACY_METER_CURVE_EXP = 1.44;

export function getLegacyMeterIntensityParams(stage: number) {
	const level = Math.min(LEGACY_METER_STAGES, Math.max(1, Math.round(stage)));

	if (level === 1) {
		return { level, passes: 0, quality: 0.95, shrink: 1 };
	}

	const tBase = (level - 1) / (LEGACY_METER_STAGES - 1);
	const t = tBase * LEGACY_METER_SCALE;
	const curve = t ** LEGACY_METER_CURVE_EXP;

	return {
		level,
		passes: Math.max(1, Math.round(curve * 18 + t * 2)),
		quality: Math.max(0.03, 0.9 - curve * 0.87),
		shrink: Math.max(0.1, 0.96 - curve * 0.82),
	};
}

const INTENSITY_GAMMA = 0.58;
const INTENSITY_CURVE_EXP = 1.28;
const METER_INTENSITY_SCALE = 0.68;
const PROCESS_INTENSITY_SCALE = 1;
const RES_REF_MIN_DIM = 1000;
const RES_FLOOR_MIN_DIM = 130;

function toIntensityT(
	v: number,
	mode: ShakalMode,
	minDimension?: number,
): number {
	let tBase = (v / INTENSITY_MAX) ** INTENSITY_GAMMA;
	if (mode === "process" && minDimension !== undefined) {
		tBase *= getResolutionFactor(minDimension);
	}
	const scale =
		mode === "meter" ? METER_INTENSITY_SCALE : PROCESS_INTENSITY_SCALE;
	return Math.min(1, tBase * scale);
}

export function getResolutionFactor(minDimension: number): number {
	if (minDimension >= RES_REF_MIN_DIM) return 1;
	if (minDimension <= RES_FLOOR_MIN_DIM) return 0.44;
	const t =
		(minDimension - RES_FLOOR_MIN_DIM) / (RES_REF_MIN_DIM - RES_FLOOR_MIN_DIM);
	return 0.44 + t * 0.56;
}

function shrinkFloor(minDimension: number): number {
	return Math.max(4, Math.min(26, Math.floor(minDimension * 0.058)));
}

export function getProcessStrength(
	level: number,
	minDimension?: number,
): number {
	const v = normalizeIntensity(level);
	if (v <= 0) return 0;
	return toIntensityT(toProcessIntensity(v), "process", minDimension);
}

export function getIntensityParams(
	level: number,
	mode: ShakalMode = "process",
	minDimension?: number,
) {
	if (mode === "meter-legacy") {
		return getLegacyMeterIntensityParams(level);
	}

	const v = normalizeIntensity(level);

	if (v <= 0) {
		return { level: v, passes: 0, quality: 0.95, shrink: 1 };
	}

	const effectiveV = mode === "process" ? toProcessIntensity(v) : v;
	const t = toIntensityT(effectiveV, mode, minDimension);
	const curve = t ** INTENSITY_CURVE_EXP;

	let passes = Math.max(1, Math.round(curve * 20 + t * 2.5));
	if (mode === "process" && minDimension !== undefined) {
		const maxPasses = Math.max(2, Math.floor(minDimension / 36));
		passes = Math.min(passes, maxPasses);
	}

	return {
		level: v,
		passes,
		quality: Math.max(0.03, 0.9 - curve * 0.87),
		shrink: Math.max(0.1, 0.96 - curve * 0.82),
	};
}

export async function shakalifySource(
	source: CanvasImageSource,
	width: number,
	height: number,
	level: number,
	mode: ShakalMode = "process",
): Promise<HTMLCanvasElement> {
	const minDim = Math.min(width, height);
	const { passes, quality, shrink } = getIntensityParams(level, mode, minDim);
	const minPx = shrinkFloor(minDim);

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas unavailable");

	let current: CanvasImageSource = source;

	if (passes === 0) {
		ctx.drawImage(source, 0, 0, width, height);
		return canvas;
	}

	for (let i = 0; i < passes; i++) {
		const passShrink = shrink ** (i + 1);
		const smallW = Math.max(minPx, Math.floor(width * passShrink));
		const smallH = Math.max(minPx, Math.floor(height * passShrink));

		const tiny = document.createElement("canvas");
		tiny.width = smallW;
		tiny.height = smallH;
		const tinyCtx = tiny.getContext("2d");
		if (!tinyCtx) throw new Error("Canvas unavailable");
		tinyCtx.imageSmoothingEnabled = false;
		tinyCtx.drawImage(current, 0, 0, smallW, smallH);

		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(tiny, 0, 0, width, height);

		const blob = await canvasToBlob(canvas, quality);
		current = await loadImage(blob);
		ctx.drawImage(current, 0, 0, width, height);
	}

	return canvas;
}

export async function shakalify(
	file: File,
	intensity: number,
	options: ShakalOptions = {},
): Promise<{ blob: Blob; stats: ShakalStats; previewUrl: string }> {
	const img = await loadImage(file);
	const minDim = Math.min(img.naturalWidth, img.naturalHeight);
	const { level, passes, quality } = getIntensityParams(
		intensity,
		"process",
		minDim,
	);
	const effects = options.effects ?? DEFAULT_EFFECTS;
	const pixelScale = Math.min(3, Math.max(1, options.pixelScale ?? 1));
	const exportPng = options.exportPng ?? false;

	let canvas = await shakalifySource(
		img,
		img.naturalWidth,
		img.naturalHeight,
		level,
		"process",
	);

	if (countActiveEffects(effects) > 0) {
		applyEffects(canvas, level, effects, minDim);
	}

	if (pixelScale > 1) {
		canvas = upscaleNearest(canvas, pixelScale);
	}

	let minDimension = Math.min(canvas.width, canvas.height);
	const { shrink } = getIntensityParams(level, "process", minDim);
	const minPx = shrinkFloor(minDim);
	for (let i = 0; i < passes; i++) {
		const passShrink = shrink ** (i + 1);
		minDimension = Math.min(
			minDimension,
			Math.max(minPx, Math.floor(img.naturalWidth * passShrink)),
			Math.max(minPx, Math.floor(img.naturalHeight * passShrink)),
		);
	}

	const exportType = exportPng ? "image/png" : "image/jpeg";
	const finalBlob = await canvasToBlob(canvas, quality, exportType);
	const previewUrl = URL.createObjectURL(finalBlob);

	const originalPixels = img.naturalWidth * img.naturalHeight;
	const effectivePixels = minDimension * minDimension;
	const pixelsMurdered = Math.round(
		(1 - effectivePixels / originalPixels) * 100,
	);

	return {
		blob: finalBlob,
		previewUrl,
		stats: {
			passes,
			quality,
			minDimension,
			pixelsMurdered: Math.min(99, Math.max(level * 0.99, pixelsMurdered)),
			effectsApplied: countActiveEffects(effects),
			pixelScale,
		},
	};
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
