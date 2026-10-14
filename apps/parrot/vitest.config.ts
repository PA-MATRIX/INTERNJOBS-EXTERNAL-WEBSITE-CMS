import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			// Alias cloudflare:workers to a no-op stub so plain Node Vitest can
			// load workers/index.ts without ERR_MODULE_NOT_FOUND.
			// The stub exports a minimal DurableObject base class that satisfies
			// the value imports in durableObject/workspace.ts and durableObject/index.ts.
			"cloudflare:workers": fileURLToPath(
				new URL(
					"./workers/tests/__mocks__/cloudflare-workers.ts",
					import.meta.url,
				),
			),
		},
	},
	test: {
		// Only run files under workers/tests/ — avoids pulling in React/Vite
		// browser tests which need a different environment.
		include: ["workers/tests/**/*.test.ts"],
		environment: "node",
		globals: false,
		// v1.7 Phase 43-02: mailbox-lookup tests run real SQL in node:sqlite.
		// Node 22.12 (local) needs --experimental-sqlite; on later 22.x the
		// flag is accepted as a no-op.
		poolOptions: {
			forks: { execArgv: ["--experimental-sqlite"] },
			threads: { execArgv: ["--experimental-sqlite"] },
		},
	},
});
