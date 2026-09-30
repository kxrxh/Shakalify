import { METER_STAGES, meterStageToIntensity } from "./processing";
import { shakalifySource } from "./shakalify";
const TILE_W = 128,
	TILE_H = 156,
	MASCOT_H = 100;
export type MeterPreviewTile = {
	intensity: number;
	stage: number;
	src: string;
};
const cache = new Map<string, Promise<MeterPreviewTile[]>>();
export function generateMeterPreviews(
	sourceUrl: string,
): Promise<MeterPreviewTile[]> {
	const cached = cache.get(sourceUrl);
	if (cached) return cached;
	const promise = new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Failed to load mascot"));
		img.src = sourceUrl;
	})
		.then(async (img) => {
			const base = document.createElement("canvas");
			base.width = TILE_W;
			base.height = MASCOT_H;
			const ctx = base.getContext("2d");
			if (!ctx) throw new Error("Canvas unavailable");
			ctx.fillStyle = "#0a0a0f";
			ctx.fillRect(0, 0, TILE_W, MASCOT_H);
			const scale = Math.min(
				TILE_W / img.naturalWidth,
				MASCOT_H / img.naturalHeight,
			);
			const w = img.naturalWidth * scale,
				h = img.naturalHeight * scale;
			ctx.drawImage(img, (TILE_W - w) / 2, (MASCOT_H - h) / 2, w, h);
			const tiles: MeterPreviewTile[] = [];
			for (let stage = 1; stage <= METER_STAGES; stage++) {
				const intensity = meterStageToIntensity(stage);
				const distorted = await shakalifySource(
					base,
					TILE_W,
					MASCOT_H,
					intensity,
				);
				const tile = document.createElement("canvas");
				tile.width = TILE_W;
				tile.height = TILE_H;
				const tileCtx = tile.getContext("2d");
				if (!tileCtx) throw new Error("Canvas unavailable");
				tileCtx.fillStyle = "#0a0a0f";
				tileCtx.fillRect(0, 0, TILE_W, TILE_H);
				tileCtx.drawImage(distorted, 0, 8);
				tileCtx.fillStyle = "#eef1f5";
				tileCtx.font = "bold 22px monospace";
				tileCtx.textAlign = "center";
				tileCtx.fillText(String(stage), TILE_W / 2, TILE_H - 10);
				tiles.push({ stage, intensity, src: tile.toDataURL("image/png") });
			}
			return tiles;
		})
		.catch((error: unknown) => {
			cache.delete(sourceUrl);
			throw error;
		});
	cache.set(sourceUrl, promise);
	return promise;
}
