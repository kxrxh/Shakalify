import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	workers: 1,
	forbidOnly: !!process.env.CI,
	use: {
		baseURL: "http://127.0.0.1:4173",
		channel: process.env.PLAYWRIGHT_CHANNEL,
		trace: "retain-on-failure",
	},
	webServer: {
		command:
			"bun run dev --configLoader runner --host 127.0.0.1 --port 4173 --strictPort",
		url: "http://127.0.0.1:4173/Shakalify/",
		reuseExistingServer: false,
	},
});
