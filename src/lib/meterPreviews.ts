import {
	intensityToLegacyStage,
	LEGACY_METER_STAGES,
	legacyStageToIntensity,
	shakalifySource,
} from "./shakalify";

const TILE_W = 128;
const TILE_H = 156;
const MASCOT_H = 100;

export type MeterPreviewTile = {
	intensity: number;
	stage: number;
	src: string;
};

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Failed to load mascot"));
		img.src = url;
	});
}

function drawLabel(ctx: CanvasRenderingContext2D, stage: number) {
	ctx.fillStyle = "#eef1f5";
	ctx.font = "bold 22px monospace";
	ctx.textAlign = "center";
	ctx.textBaseline = "bottom";
	ctx.fillText(String(stage), TILE_W / 2, TILE_H - 10);
}

async function renderMeterTile(
	source: HTMLImageElement,
	stage: number,
): Promise<string> {
	const canvas = document.createElement("canvas");
	canvas.width = TILE_W;
	canvas.height = TILE_H;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas unavailable");

	ctx.fillStyle = "#0a0a0f";
	ctx.fillRect(0, 0, TILE_W, TILE_H);

	if (stage === 1) {
		ctx.imageSmoothingEnabled = true;
		const scale = Math.min(
			TILE_W / source.naturalWidth,
			MASCOT_H / source.naturalHeight,
		);
		const w = source.naturalWidth * scale;
		const h = source.naturalHeight * scale;
		ctx.drawImage(source, (TILE_W - w) / 2, 8 + (MASCOT_H - h) / 2, w, h);
	} else {
		const distorted = await shakalifySource(
			source,
			TILE_W,
			MASCOT_H,
			stage,
			"meter-legacy",
		);
		ctx.drawImage(distorted, 0, 8);
	}

	drawLabel(ctx, stage);

	return canvas.toDataURL("image/png");
}

const CACHE_VERSION = 7;
let cache: { version: number; data: Promise<MeterPreviewTile[]> } | null = null;

export function generateMeterPreviews(
	sourceUrl: string,
): Promise<MeterPreviewTile[]> {
	if (!cache || cache.version !== CACHE_VERSION) {
		cache = {
			version: CACHE_VERSION,
			data: loadImage(sourceUrl).then(async (img) => {
				const tiles: MeterPreviewTile[] = [];
				for (let stage = 1; stage <= LEGACY_METER_STAGES; stage++) {
					tiles.push({
						stage,
						intensity: legacyStageToIntensity(stage),
						src: await renderMeterTile(img, stage),
					});
				}
				return tiles;
			}),
		};
	}
	return cache.data;
}

export function nearestMeterPreviewIntensity(value: number): number {
	return legacyStageToIntensity(intensityToLegacyStage(value));
}
