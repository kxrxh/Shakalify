import {
	applyEffects,
	countActiveEffects,
	DEFAULT_EFFECTS,
	type EffectOptions,
} from "./effects";
import {
	getExportDimensions,
	getIntensitySettings,
	getProcessingPlan,
	type DegradationSettings,
} from "./processing";
function checkAbort(signal?: AbortSignal) {
	signal?.throwIfAborted();
}
function loadImage(
	source: File | Blob,
	signal?: AbortSignal,
): Promise<HTMLImageElement> {
	checkAbort(signal);
	return new Promise((resolve, reject) => {
		const img = new Image(),
			url = URL.createObjectURL(source);
		const cleanup = () => {
			img.onload = null;
			img.onerror = null;
			signal?.removeEventListener("abort", onAbort);
			URL.revokeObjectURL(url);
		};
		const onAbort = () => {
			cleanup();
			img.src = "";
			reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
		};
		img.onload = () => {
			cleanup();
			if (!img.naturalWidth || !img.naturalHeight)
				reject(new Error("Не удалось определить размер изображения."));
			else resolve(img);
		};
		img.onerror = () => {
			cleanup();
			reject(
				new Error(
					"Не удалось открыть изображение. Файл повреждён или его формат не поддерживается браузером.",
				),
			);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		img.src = url;
	});
}
function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: "image/jpeg" | "image/png",
	quality: number,
	signal?: AbortSignal,
): Promise<Blob> {
	checkAbort(signal);
	return new Promise((resolve, reject) => {
		const onAbort = () =>
			reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
		signal?.addEventListener("abort", onAbort, { once: true });
		try {
			canvas.toBlob(
				(blob) => {
					signal?.removeEventListener("abort", onAbort);
					if (signal?.aborted) return;
					if (!blob)
						reject(
							new Error(
								"Не удалось сохранить изображение. Попробуй уменьшить масштаб экспорта.",
							),
						);
					else if (blob.type !== type)
						reject(
							new Error("Браузер не поддерживает выбранный формат экспорта."),
						);
					else resolve(blob);
				},
				type,
				type === "image/jpeg" ? quality : undefined,
			);
		} catch (error) {
			signal?.removeEventListener("abort", onAbort);
			reject(error);
		}
	});
}
function makeCanvas(width: number, height: number) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx)
		throw new Error(
			"Браузер не смог создать изображение. Попробуй уменьшить его размер.",
		);
	return { canvas, ctx };
}
async function degradeSource(
	source: CanvasImageSource,
	width: number,
	height: number,
	settings: DegradationSettings,
	signal?: AbortSignal,
) {
	checkAbort(signal);
	const plan = getProcessingPlan(width, height, settings);
	const { canvas, ctx } = makeCanvas(plan.workingWidth, plan.workingHeight);
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
	if (plan.pixelation > 0) {
		const tiny = makeCanvas(plan.gridWidth, plan.gridHeight);
		tiny.ctx.imageSmoothingEnabled = true;
		tiny.ctx.imageSmoothingQuality = "high";
		tiny.ctx.drawImage(canvas, 0, 0, tiny.canvas.width, tiny.canvas.height);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(tiny.canvas, 0, 0, canvas.width, canvas.height);
	}
	for (let pass = 0; pass < plan.jpegPasses; pass++) {
		checkAbort(signal);
		const blob = await canvasToBlob(
			canvas,
			"image/jpeg",
			plan.jpegQuality / 100,
			signal,
		);
		const image = await loadImage(blob, signal);
		checkAbort(signal);
		ctx.drawImage(image, 0, 0);
	}
	return { canvas, plan };
}
// Meter thumbnails share the normalized plan with the user's image.
export async function shakalifySource(
	source: CanvasImageSource,
	width: number,
	height: number,
	level: number,
): Promise<HTMLCanvasElement> {
	const { canvas } = await degradeSource(
		source,
		width,
		height,
		getIntensitySettings(level),
	);
	const output = makeCanvas(width, height);
	output.ctx.imageSmoothingEnabled = false;
	output.ctx.drawImage(canvas, 0, 0, width, height);
	return output.canvas;
}
export type ShakalStats = {
	jpegEncodes: number;
	jpegQuality: number | null;
	gridWidth: number;
	gridHeight: number;
	gridReduction: number;
	outputWidth: number;
	outputHeight: number;
	effectsApplied: number;
};
export type ShakalOptions = {
	effects?: EffectOptions;
	settings?: DegradationSettings;
	pixelScale?: number;
	exportPng?: boolean;
	signal?: AbortSignal;
};
export async function shakalify(
	file: File,
	intensity: number,
	options: ShakalOptions = {},
): Promise<{ blob: Blob; stats: ShakalStats }> {
	const { signal } = options;
	const img = await loadImage(file, signal);
	checkAbort(signal);
	const output = getExportDimensions(
		img.naturalWidth,
		img.naturalHeight,
		options.pixelScale ?? 1,
	);
	const effects = options.effects ?? DEFAULT_EFFECTS;
	const { canvas, plan } = await degradeSource(
		img,
		img.naturalWidth,
		img.naturalHeight,
		options.settings ?? getIntensitySettings(intensity),
		signal,
	);
	checkAbort(signal);
	if (countActiveEffects(effects) > 0) applyEffects(canvas, intensity, effects);
	checkAbort(signal);
	const final = makeCanvas(output.width, output.height);
	final.ctx.imageSmoothingEnabled = plan.pixelation <= 0;
	final.ctx.imageSmoothingQuality = "high";
	final.ctx.drawImage(canvas, 0, 0, output.width, output.height);
	const type = options.exportPng ? "image/png" : "image/jpeg";
	// Export quality is independent from the intentional JPEG degradation.
	const blob = await canvasToBlob(final.canvas, type, 0.95, signal);
	checkAbort(signal);
	return {
		blob,
		stats: {
			jpegEncodes: plan.jpegPasses + (type === "image/jpeg" ? 1 : 0),
			jpegQuality:
				plan.jpegPasses > 0
					? plan.jpegQuality
					: type === "image/jpeg"
						? 95
						: null,
			gridWidth: plan.gridWidth,
			gridHeight: plan.gridHeight,
			gridReduction: plan.gridReduction,
			outputWidth: output.width,
			outputHeight: output.height,
			effectsApplied: countActiveEffects({
				...effects,
				noise: effects.noise && intensity > 0,
			}),
		},
	};
}
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
