import { describe, expect, test } from "bun:test";
import {
	getExportDimensions,
	getIntensitySettings,
	getProcessingPlan,
	normalizeIntensity,
	normalizeSettings,
} from "../../src/lib/processing";

describe("normalized degradation", () => {
	test("same aspect ratio uses the same grid and JPEG settings at every nonzero level", () => {
		for (let level = 1; level <= 100; level++) {
			const settings = getIntensitySettings(level);
			const reference = getProcessingPlan(256, 144, settings);
			for (const [width, height] of [
				[512, 288],
				[1920, 1080],
				[3840, 2160],
			]) {
				expect(getProcessingPlan(width, height, settings)).toEqual(reference);
			}
		}
	});
	test("pixel grid does not hit its lower bound in the middle of the scale", () => {
		const grids = [0, 25, 50, 67, 85, 100].map((level) =>
			getProcessingPlan(1920, 1080, getIntensitySettings(level)),
		);
		for (let index = 2; index < grids.length; index++) {
			expect(grids[index].gridWidth).toBeLessThan(grids[index - 1].gridWidth);
			expect(grids[index].gridHeight).toBeLessThan(grids[index - 1].gridHeight);
		}
		for (let level = 1; level < 100; level++) {
			expect(
				getProcessingPlan(1920, 1080, getIntensitySettings(level)).gridWidth,
			).toBeGreaterThan(grids.at(-1)!.gridWidth);
		}
	});
	test("changing JPEG quality or generation count does not change the pixel grid", () => {
		const base = { pixelation: 50, jpegQuality: 50, jpegPasses: 2 };
		const original = getProcessingPlan(500, 300, base);
		for (const settings of [
			{ ...base, jpegQuality: 1 },
			{ ...base, jpegPasses: 8 },
			{ ...base, jpegPasses: 0 },
		]) {
			const plan = getProcessingPlan(500, 300, settings);
			expect([plan.gridWidth, plan.gridHeight]).toEqual([
				original.gridWidth,
				original.gridHeight,
			]);
		}
	});
	test("zero keeps rectangular and portrait geometry, with zero grid reduction", () => {
		for (const [width, height] of [
			[200, 100],
			[100, 200],
			[17, 13],
		]) {
			const plan = getProcessingPlan(width, height, getIntensitySettings(0));
			expect([plan.gridWidth, plan.gridHeight]).toEqual([width, height]);
			expect(plan.gridReduction).toBe(0);
			expect(plan.jpegPasses).toBe(0);
		}
	});
	test("grid preserves the source aspect ratio within integer rounding", () => {
		for (const [width, height] of [
			[4000, 3000],
			[1080, 1920],
			[7000, 100],
			[100, 7000],
		]) {
			for (const level of [1, 50, 100]) {
				const { gridWidth, gridHeight } = getProcessingPlan(
					width,
					height,
					getIntensitySettings(level),
				);
				expect(gridWidth).toBeGreaterThan(0);
				expect(gridHeight).toBeGreaterThan(0);
				expect(
					Math.abs(gridWidth * height - gridHeight * width),
				).toBeLessThanOrEqual(
					(width + height) / (gridWidth > 1 && gridHeight > 1 ? 2 : 1),
				);
			}
		}
	});
	test("invalid controls are bounded and invalid source sizes are rejected", () => {
		expect(normalizeIntensity(Number.NaN)).toBe(0);
		expect(
			normalizeSettings({ pixelation: -10, jpegQuality: 120, jpegPasses: 100 }),
		).toEqual({ pixelation: 0, jpegQuality: 100, jpegPasses: 8 });
		expect(() => getProcessingPlan(0, 100, getIntensitySettings(50))).toThrow();
	});
	test("export scaling is independent and rejects excessive output allocations", () => {
		expect(getExportDimensions(200, 100, 3)).toEqual({
			width: 600,
			height: 300,
			scale: 3,
		});
		expect(() => getExportDimensions(4000, 3000, 3)).toThrow(
			"Результат слишком большой",
		);
	});
});
