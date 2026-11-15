import { expect, test } from "bun:test";
import { join } from "node:path";

test("compat: the installed senpi's builtin tps loads and gives one single-line TPS notice", async () => {
	const proc = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures", "tps-compat.ts")], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	expect(stderr).toBe("");
	expect(code).toBe(0);
	const { path, notices, retry } = JSON.parse(stdout.trim().split("\n").at(-1) as string);
	expect(path.replaceAll("\\", "/")).toEndWith("/core/extensions/builtin/tps.js");
	expect(notices).toEqual(["TPS 100.0 tok/s. Cache hit 75.0%, 1.0s"]);
	// the goal's providerRetryAt decides whether senpi posts "Goal paused until ..."
	expect(retry.named).toBe(retry.now + 3_600_000);
	expect(retry.bare).toBeNull();
}, 60_000);
