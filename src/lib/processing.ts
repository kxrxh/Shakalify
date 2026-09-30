export const INTENSITY_MIN = 0;
export const INTENSITY_MAX = 100;
export const DEFAULT_INTENSITY = 67;
export const METER_STAGES = 9;
export const WORKING_LONG_EDGE = 1024;
export const MAX_JPEG_PASSES = 8;
export const MAX_EXPORT_PIXELS = 16_777_216;
export const MAX_EXPORT_EDGE = 8192;
export type DegradationSettings = {
	pixelation: number;
	jpegQuality: number;
	jpegPasses: number;
};
function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
export function normalizeIntensity(level: number): number {
	return clamp(level, INTENSITY_MIN, INTENSITY_MAX);
}
export function getProcessStrength(level: number): number {
	return normalizeIntensity(level) / INTENSITY_MAX;
}
export function formatIntensityLabel(level: number): string {
	return `${Math.round(normalizeIntensity(level))}%`;
}
export function meterStageToIntensity(stage: number): number {
	return (
		((clamp(Math.round(stage), 1, METER_STAGES) - 1) / (METER_STAGES - 1)) *
		INTENSITY_MAX
	);
}
export function intensityToMeterStage(level: number): number {
	return Math.round(1 + getProcessStrength(level) * (METER_STAGES - 1));
}
export function getIntensitySettings(level: number): DegradationSettings {
	const t = getProcessStrength(level);
	return {
		pixelation: normalizeIntensity(level),
		jpegQuality: Math.round(95 - 87 * t ** 1.15),
		jpegPasses: t === 0 ? 0 : 1 + Math.round(5 * t ** 1.4),
	};
}
export function normalizeSettings(
	settings: DegradationSettings,
): DegradationSettings {
	return {
		pixelation: normalizeIntensity(settings.pixelation),
		jpegQuality: Math.round(clamp(settings.jpegQuality, 1, 100)),
		jpegPasses: Math.round(clamp(settings.jpegPasses, 0, MAX_JPEG_PASSES)),
	};
}
export function getProcessingPlan(
	width: number,
	height: number,
	input: DegradationSettings,
) {
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width <= 0 ||
		height <= 0
	)
		throw new Error("Не удалось определить размер изображения.");
	const settings = normalizeSettings(input);
	const isDegrading = settings.pixelation > 0 || settings.jpegPasses > 0;
	// JPEG blocks and the pixel grid share a common relative scale.
	// Enlarging a small input does not restore its missing detail.
	const scale = isDegrading ? WORKING_LONG_EDGE / Math.max(width, height) : 1;
	const workingWidth = Math.max(1, Math.round(width * scale));
	const workingHeight = Math.max(1, Math.round(height * scale));
	const gridLongEdge = Math.round(
		WORKING_LONG_EDGE *
			(32 / WORKING_LONG_EDGE) ** ((settings.pixelation / 100) ** 1.25),
	);
	// Round once from the original aspect ratio, not from an already-rounded
	// working size (the latter distorts very wide or tall input grids).
	const gridScale = gridLongEdge / Math.max(width, height);
	const gridWidth =
		settings.pixelation > 0
			? Math.max(1, Math.round(width * gridScale))
			: workingWidth;
	const gridHeight =
		settings.pixelation > 0
			? Math.max(1, Math.round(height * gridScale))
			: workingHeight;
	const gridReduction =
		Math.round(
			(1 - (gridWidth * gridHeight) / (workingWidth * workingHeight)) * 1000,
		) / 10;
	return {
		...settings,
		workingWidth,
		workingHeight,
		gridWidth,
		gridHeight,
		gridReduction,
	};
}
export function getExportDimensions(
	width: number,
	height: number,
	inputScale: number,
) {
	const scale = Math.round(clamp(inputScale, 1, 3));
	const outputWidth = width * scale,
		outputHeight = height * scale;
	if (
		outputWidth > MAX_EXPORT_EDGE ||
		outputHeight > MAX_EXPORT_EDGE ||
		outputWidth * outputHeight > MAX_EXPORT_PIXELS
	)
		throw new Error(
			"Результат слишком большой. Уменьши масштаб экспорта или размер исходного изображения.",
		);
	return { width: outputWidth, height: outputHeight, scale };
}
