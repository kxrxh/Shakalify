import { expect, test, type Page } from "@playwright/test";

declare global {
	interface Window {
		testUrls: Set<string>;
		testEncodeCalls: number;
		testPendingEncodes: number;
		testEncodeDelay: number;
	}
}

async function imageFile(page: Page, width = 200, height = 100) {
	const bytes = await page.evaluate(
		async ({ width, height }) => {
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d")!;
			ctx.fillStyle = "#3284e6";
			ctx.fillRect(0, 0, width, height);
			ctx.fillStyle = "#f05a20";
			ctx.fillRect(width / 3, height / 3, width / 3, height / 3);
			const blob = await new Promise<Blob>((resolve) =>
				canvas.toBlob((blob) => resolve(blob!), "image/png"),
			);
			return Array.from(new Uint8Array(await blob.arrayBuffer()));
		},
		{ width, height },
	);
	return {
		name: "sample.png",
		mimeType: "image/png",
		buffer: Buffer.from(bytes),
	};
}

async function ready(page: Page) {
	await expect(
		page.getByRole("button", { name: "Скачать", exact: true }),
	).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
	await page.goto("/Shakalify/");
	await expect(page.getByRole("heading", { level: 1 })).toContainText(
		"ШАКАЛИФАЙ",
	);
	await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});

test("keyboard opens the file chooser and exports a real JPEG with source dimensions", async ({
	page,
}) => {
	const fixture = await imageFile(page);
	await page.keyboard.press("Tab");
	await expect(
		page.getByRole("button", { name: "Выбрать файл", exact: true }),
	).toBeFocused();
	const chooser = page.waitForEvent("filechooser");
	await page.keyboard.press("Enter");
	await (await chooser).setFiles(fixture);
	await ready(page);
	await expect(page.locator(".stats")).toContainText("200×100");
	const download = page.waitForEvent("download");
	await page.getByRole("button", { name: "Скачать", exact: true }).click();
	expect((await download).suggestedFilename()).toBe("shakal_sample.jpg");
	const actual = await page
		.locator(".preview-img--shakal")
		.evaluate(async (img: HTMLImageElement) => {
			const blob = await (await fetch(img.src)).blob();
			const bitmap = await createImageBitmap(blob);
			const result = {
				type: blob.type,
				width: bitmap.width,
				height: bitmap.height,
			};
			bitmap.close();
			return result;
		});
	expect(actual).toEqual({ type: "image/jpeg", width: 200, height: 100 });
	await page.getByRole("button", { name: "Сравнить", exact: true }).click();
	await expect(
		page.getByRole("slider", { name: "Сравнение до и после" }),
	).toBeVisible();
	await page.getByRole("button", { name: "2 окна", exact: true }).click();
	await expect(page.locator(".preview-img--shakal")).toBeVisible();
});

test("malformed image shows an error, stops its loader and allows replacement", async ({
	page,
}) => {
	await page.locator("input[type=file]").setInputFiles({
		name: "broken.png",
		mimeType: "image/png",
		buffer: Buffer.from("broken image"),
	});
	await expect(page.getByRole("alert")).toContainText("Не удалось открыть");
	await expect(page.locator(".processing")).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Попробовать снова" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Другую картинку" }).click();
	await page.locator("input[type=file]").setInputFiles(await imageFile(page));
	await ready(page);
	await expect(page.getByRole("alert")).toHaveCount(0);
});

test("zero PNG preserves pixels and alpha, with honest grid and JPEG statistics", async ({
	page,
}) => {
	const actual = await page.evaluate(async () => {
		const moduleUrl = "/Shakalify/src/lib/shakalify.ts";
		const { shakalify } = await import(moduleUrl);
		const canvas = document.createElement("canvas");
		canvas.width = 200;
		canvas.height = 100;
		const ctx = canvas.getContext("2d")!;
		ctx.fillStyle = "#f04612";
		ctx.fillRect(50, 25, 100, 50);
		const source = ctx.getImageData(0, 0, 200, 100).data;
		const blob = await new Promise<Blob>((resolve) =>
			canvas.toBlob((blob) => resolve(blob!), "image/png"),
		);
		const file = new File([blob], "alpha.png", { type: "image/png" });
		const png = await shakalify(file, 0, { exportPng: true });
		const jpeg = await shakalify(file, 0);
		const bitmap = await createImageBitmap(png.blob);
		ctx.clearRect(0, 0, 200, 100);
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();
		const output = ctx.getImageData(0, 0, 200, 100).data;
		return {
			samePixels: source.every((value, index) => value === output[index]),
			gridReduction: png.stats.gridReduction,
			grid: [png.stats.gridWidth, png.stats.gridHeight],
			pngEncodes: png.stats.jpegEncodes,
			jpegEncodes: jpeg.stats.jpegEncodes,
		};
	});
	expect(actual).toEqual({
		samePixels: true,
		gridReduction: 0,
		grid: [200, 100],
		pngEncodes: 0,
		jpegEncodes: 1,
	});
});

test("manual JPEG changes leave the pixel grid unchanged; output scale and format are independent", async ({
	page,
}) => {
	await page.locator("input[type=file]").setInputFiles(await imageFile(page));
	await ready(page);
	const gridBefore = await page.locator(".stats .stat").first().textContent();
	await page.locator(".degradation-controls summary").click();
	await page
		.getByRole("slider", { name: "JPEG-качество", exact: true })
		.focus();
	await page.keyboard.press("Home");
	await ready(page);
	await expect(page.locator(".stats .stat").first()).toHaveText(gridBefore!);
	await expect(page.locator(".meter-value")).toHaveText("Вручную");
	await page.getByRole("button", { name: "3×", exact: true }).click();
	await page.getByText("Экспорт PNG", { exact: true }).click();
	await expect(
		page.getByRole("checkbox", { name: "Экспорт PNG" }),
	).toBeChecked();
	await ready(page);
	await expect(page.locator(".stats")).toContainText("600×300");
	const actual = await page
		.locator(".preview-img--shakal")
		.evaluate(async (img: HTMLImageElement) => {
			const blob = await (await fetch(img.src)).blob();
			const bitmap = await createImageBitmap(blob);
			const result = [blob.type, bitmap.width, bitmap.height];
			bitmap.close();
			return result;
		});
	expect(actual).toEqual(["image/png", 600, 300]);
	await page.getByRole("button", { name: "Связать со шкалой" }).click();
	await ready(page);
	await expect(page.locator(".meter-value")).toHaveText("67%");
});

test("real processing uses the same degradation parameters across source resolutions", async ({
	page,
}) => {
	const measurements = await page.evaluate(async () => {
		const moduleUrl = "/Shakalify/src/lib/shakalify.ts";
		const { shakalify } = await import(moduleUrl);
		const results = [];
		for (const width of [128, 512, 2048]) {
			const height = (width * 9) / 16;
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d")!;
			const gradient = ctx.createLinearGradient(0, 0, width, height);
			gradient.addColorStop(0, "#c22838");
			gradient.addColorStop(1, "#2b8aca");
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
			const source = await new Promise<Blob>((resolve) =>
				canvas.toBlob((blob) => resolve(blob!), "image/png"),
			);
			const { blob, stats } = await shakalify(
				new File([source], "sample.png", { type: "image/png" }),
				67,
				{ exportPng: true },
			);
			const bitmap = await createImageBitmap(blob);
			results.push({
				grid: [stats.gridWidth, stats.gridHeight],
				quality: stats.jpegQuality,
				jpegEncodes: stats.jpegEncodes,
				output: [bitmap.width, bitmap.height],
			});
			bitmap.close();
		}
		return results;
	});
	for (const [index, width] of [128, 512, 2048].entries()) {
		expect(measurements[index]).toEqual({
			grid: measurements[0].grid,
			quality: measurements[0].quality,
			jpegEncodes: measurements[0].jpegEncodes,
			output: [width, (width * 9) / 16],
		});
	}
});

test("reset aborts an in-flight encode and releases every blob URL", async ({
	page,
}) => {
	await page.addInitScript(() => {
		window.testUrls = new Set();
		window.testEncodeCalls = 0;
		window.testPendingEncodes = 0;
		window.testEncodeDelay = 0;
		const create = URL.createObjectURL.bind(URL),
			revoke = URL.revokeObjectURL.bind(URL);
		URL.createObjectURL = (blob) => {
			const url = create(blob);
			window.testUrls.add(url);
			return url;
		};
		URL.revokeObjectURL = (url) => {
			window.testUrls.delete(url);
			revoke(url);
		};
		const original = HTMLCanvasElement.prototype.toBlob;
		HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
			window.testEncodeCalls++;
			window.testPendingEncodes++;
			original.call(
				this,
				(blob) =>
					setTimeout(() => {
						window.testPendingEncodes--;
						callback(blob);
					}, window.testEncodeDelay),
				type,
				quality,
			);
		};
	});
	await page.reload();
	await page.locator("input[type=file]").setInputFiles(await imageFile(page));
	await ready(page);
	await expect(page.locator(".meter-tile img")).toHaveCount(9);
	await expect
		.poll(() => page.evaluate(() => window.testPendingEncodes))
		.toBe(0);
	const before = await page.evaluate(() => {
		window.testEncodeDelay = 200;
		return window.testEncodeCalls;
	});
	await page.getByRole("slider", { name: "Степень шакалинга" }).focus();
	await page.keyboard.press("End");
	await expect
		.poll(() => page.evaluate(() => window.testEncodeCalls))
		.toBeGreaterThan(before);
	const atCancel = await page.evaluate(() => window.testEncodeCalls);
	await page.getByRole("button", { name: "Другую картинку" }).click();
	await expect
		.poll(() => page.evaluate(() => window.testPendingEncodes))
		.toBe(0);
	await expect.poll(() => page.evaluate(() => window.testUrls.size)).toBe(0);
	expect(await page.evaluate(() => window.testEncodeCalls)).toBe(atCancel);
	await expect(page.locator(".stats")).toHaveCount(0);
	await page.evaluate(() => {
		window.testEncodeDelay = 0;
	});
	await page
		.locator("input[type=file]")
		.setInputFiles(await imageFile(page, 300, 150));
	await ready(page);
	await expect(page.locator(".stats")).toContainText("300×150");
});

test("export failure is retryable and thumbnail failure keeps numeric controls available", async ({
	page,
}) => {
	await page.route("**/src/assets/shakal.png*", (route) =>
		route.request().resourceType() === "image"
			? route.abort()
			: route.continue(),
	);
	await page.reload();
	await page.locator("input[type=file]").setInputFiles(await imageFile(page));
	await ready(page);
	await expect(page.locator(".meter-tile")).toHaveCount(9);
	await expect(page.locator(".meter-tile__fallback")).toHaveCount(9);
	await page.evaluate(() => {
		const original = HTMLCanvasElement.prototype.toBlob;
		HTMLCanvasElement.prototype.toBlob = function (callback) {
			HTMLCanvasElement.prototype.toBlob = original;
			callback(null);
		};
	});
	await page.getByRole("slider", { name: "Степень шакалинга" }).focus();
	await page.keyboard.press("Home");
	await expect(page.getByRole("alert")).toContainText("Не удалось сохранить");
	await expect(page.locator(".processing")).toHaveCount(0);
	await page.getByRole("button", { name: "Попробовать снова" }).click();
	await ready(page);
	await expect(page.getByRole("alert")).toHaveCount(0);
});
