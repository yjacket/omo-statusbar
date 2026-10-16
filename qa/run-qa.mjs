import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { displayWidth } from "../extension/statusbar/text.ts";

const root = resolve(import.meta.dirname, "..");
const qa = join(root, "qa");
const agentDir = process.env.OMO_CODING_AGENT_DIR || join(homedir(), ".omo", "agent");
const config = join(agentDir, "statusbar.json");
const backup = `${config}.qa-backup`;
// A status-arrange.json from before the rename is read when statusbar.json is missing, so it is parked too.
const legacy = join(agentDir, "status-arrange.json");
const legacyBackup = `${legacy}.qa-backup`;
const fixture = "qa/fixtures/qa-statuses.ts";
const dualExt = "extension/statusbar/index.ts;qa/fixtures/qa-statuses.ts";
const scenarios = [
	"S1-control", "S1-parity",
	"S2-hide", "S2-persist",
	"S3-reorder", "S3-persist",
	"S4-newkey", "S5-discard",
	"S6-reload", "S7-corrupt",
	"S8-narrow", "S9-print",
	"S10-separator", "S10-persist", "S11-git",
];
const args = process.argv.slice(2);
const list = args.includes("--list");
const onlyIndex = args.indexOf("--only");
let selected = scenarios;
if (onlyIndex !== -1) {
	const names = (args[onlyIndex + 1] || "").split(",").filter(Boolean);
	const unknown = names.find((name) => !scenarios.includes(name));
	if (unknown) {
		console.error(`unknown scenario ${unknown}`);
		process.exit(1);
	}
	selected = scenarios.filter((name) => names.includes(name));
}
if (list) {
	console.log(scenarios.join("\n"));
	process.exit(0);
}

const evidence = (name) => join(root, ".omo", "evidence", name);
const footer = (path) => readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim()).slice(-2);
// The extension's own omo-cache status (🔥 52m / 🧊 / 🧊 12m) depends on the clock, so it is dropped before comparing.
const withoutCache = (line) => line.replace(/\s*(?:[|·/]\s*)?\[?(?:🔥 \d+m|🧊(?: \d+[mh])?)\]?/gu, "").trim();
const line2 = (name, shot = "footer") => withoutCache(footer(join(evidence(name), `${shot}.txt`))[1] || "");
const readText = (name, file) => readFileSync(join(evidence(name), `${file}.txt`), "utf8");
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };
const run = (command, args, options = {}) => spawnSync(command, args, {
	cwd: root,
	encoding: "utf8",
	...options,
});

const shared = mkdtempSync(join(tmpdir(), "statusbar-qa-"));
let hadConfig = false;
let hadLegacy = false;
let gitDir;
let failures = 0;
try {
	if (existsSync(backup)) throw new Error(`backup already exists: ${backup}`);
	if (existsSync(legacyBackup)) throw new Error(`backup already exists: ${legacyBackup}`);
	if (existsSync(legacy)) {
		hadLegacy = true;
		renameSync(legacy, legacyBackup);
	}
	if (existsSync(config)) {
		hadConfig = true;
		renameSync(config, backup);
	}

	const execute = (name, steps, ext, extra = [], cwd = shared) => {
		const out = `.omo/evidence/${name}`;
		const result = run("bun", [
			"qa/tui-qa.mjs", "--cwd", cwd, "--steps", `qa/steps/${steps}.json`,
			"--out", out, "--ext", ext, ...extra,
		]);
		if (result.status !== 0) throw new Error(result.stderr || result.stdout || `harness exited ${result.status}`);
	};
	let current = "";
	const scenario = async (name, action) => {
		if (!selected.includes(name)) return;
		current = name;
		try {
			await action();
			console.log(`PASS ${name}`);
		} catch (error) {
			failures++;
			console.log(`FAIL ${name}: ${error.message}`);
		}
	};

	await scenario("S1-control", () => execute("S1-control", "baseline", fixture));
	await scenario("S1-parity", () => {
		execute("S1-parity", "baseline", dualExt);
		assert(line2("S1-parity") === line2("S1-control") && footer(join(evidence("S1-parity"), "footer.txt"))[0] === footer(join(evidence("S1-control"), "footer.txt"))[0], "footer differs from control");
	});
	await scenario("S2-hide", () => {
		execute("S2-hide", "hide", dualExt);
		assert(!line2("S2-hide", "preview").includes("OmO Native"), "preview still contains OmO Native");
		assert(!line2("S2-hide", "closed").includes("OmO Native"), "closed footer still contains OmO Native");
		assert(JSON.parse(readFileSync(config, "utf8")).hidden.includes("  omo-native"), "config does not hide  omo-native");
	});
	await scenario("S2-persist", () => {
		execute("S2-persist", "baseline", dualExt);
		assert(!line2("S2-persist").includes("OmO Native"), "hidden status did not persist");
	});
	await scenario("S3-reorder", () => {
		execute("S3-reorder", "reorder", dualExt);
		assert(line2("S3-reorder", "moved").startsWith("QA-Z"), "moved footer does not start with QA-Z");
		// Other installed extensions may publish late, so "bottom" is checked among the fixture's own items.
		assert((line2("S3-reorder", "bottom").match(/QA-[A-Z]/g) || []).at(-1) === "QA-Z", "B did not move QA-Z to the bottom");
		assert(line2("S3-reorder", "top").startsWith("QA-Z"), "T did not move QA-Z back to the top");
		assert(line2("S3-reorder", "closed").startsWith("QA-Z"), "saved footer does not start with QA-Z");
	});
	await scenario("S3-persist", () => {
		execute("S3-persist", "baseline", dualExt);
		assert(line2("S3-persist").startsWith("QA-Z"), "reordered status did not persist");
	});
	await scenario("S4-newkey", () => {
		const key = join(shared, ".qa-new-key");
		writeFileSync(key, "");
		try {
			execute("S4-newkey", "baseline", dualExt);
		} finally {
			rmSync(key, { force: true });
		}
		const line = line2("S4-newkey");
		assert(line.includes("QA-A QA-B"), "QA-B is not adjacent to QA-A");
		assert(line.startsWith("QA-Z"), "new-key footer does not start with QA-Z");
	});
	await scenario("S5-discard", () => {
		execute("S5-discard", "discard", dualExt);
		// Installed extensions such as omo-health publish their status a few seconds after start, so compare the
		// fixture's own items (QA-*) and the badge, which are present from session_start in every capture.
		const own = (line) => (line.match(/QA-[A-Z]|OmO Native/g) || []).join(" ");
		assert(own(line2("S5-discard", "staged")) !== own(line2("S3-persist")), "staged preview did not change");
		assert(readText("S5-discard", "warn").includes("한 번 더 누르면 버립니다"), "discard warning is missing");
		assert(own(line2("S5-discard", "closed")) === own(line2("S3-persist")), "discard did not restore saved footer");
	});
	await scenario("S6-reload", () => {
		execute("S6-reload", "reload", dualExt);
		for (const shot of ["reloaded", "newsession"]) {
			const line = line2("S6-reload", shot);
			assert(line.startsWith("QA-Z") && !line.includes("OmO Native"), `${shot} order or hidden status is wrong`);
			assert((line.match(/QA-A/g) || []).length === 1, `${shot} does not contain QA-A exactly once`);
		}
	});
	await scenario("S7-corrupt", () => {
		writeFileSync(config, "{not json");
		execute("S7-corrupt", "baseline", dualExt);
		assert(readText("S7-corrupt", "footer").includes("statusbar.json"), "corrupt-config warning is missing");
		assert(line2("S7-corrupt") === line2("S1-control"), "corrupt config did not use default status order");
		rmSync(config, { force: true });
	});
	await scenario("S8-narrow", () => {
		execute("S8-narrow", "narrow", dualExt, ["--cols", "80"]);
		const text = readText("S8-narrow", "picker");
		assert(text.split(/\r?\n/).every((line) => displayWidth(line) <= 80), "picker exceeds 80 columns");
		assert(text.includes("상태줄 정리") && text.includes("s 저장"), "picker text is missing");
	});
	await scenario("S9-print", () => {
		const result = run("bun", [
			"C:/Users/yjack/.bun/install/global/node_modules/omo-ai/bin/omo.js", "--no-session", "--no-extensions",
			"-e", "extension/statusbar/index.ts", "-p", "Reply with exactly: ok",
		], { timeout: 120000 });
		assert(result.status === 0, `print command exited ${result.status}`);
		assert(!/statusbar[\s\S]*?(?:Error|at )/.test(result.stderr), "statusbar stack trace in stderr");
	});
	// Installed extensions (og-promo, omo-health) may publish between the fixture items, so each QA item
	// is checked for its own "| " prefix instead of requiring the two to be adjacent.
	const piped = (line) => line.includes("| QA-A") && line.includes("| QA-Z");
	await scenario("S10-separator", () => {
		execute("S10-separator", "separator", dualExt);
		assert(piped(line2("S10-separator", "preview")), "preview does not use the pipe separator");
		assert(piped(line2("S10-separator", "closed")), "closed footer does not use the pipe separator");
		assert(JSON.parse(readFileSync(config, "utf8")).separator === "pipe", "config does not save separator pipe");
	});
	await scenario("S10-persist", () => {
		execute("S10-persist", "baseline", dualExt);
		assert(piped(line2("S10-persist")), "separator did not persist");
	});
	await scenario("S11-git", () => {
		gitDir = mkdtempSync(join(tmpdir(), "statusbar-git-"));
		const init = run("git", ["init", "-q"], { cwd: gitDir });
		assert(init.status === 0, `git init exited ${init.status}`);
		writeFileSync(join(gitDir, "a.txt"), "a\n");
		writeFileSync(join(gitDir, "b.txt"), "b\n");
		const status = run("git", ["status", "--porcelain"], { cwd: gitDir });
		assert(status.stdout.trim().split(/\r?\n/).length === 2, `git status --porcelain is not 2 lines: ${status.stdout}`);
		execute("S11-git", "git", dualExt, [], gitDir);
		assert(line2("S11-git").includes("±2"), "footer does not show the dirty count");
		assert(line2("S11-git", "preview").includes("📝 2"), "preview does not use the emoji git icon");
		assert(line2("S11-git", "closed").includes("📝 2"), "closed footer does not use the emoji git icon");
		assert(JSON.parse(readFileSync(config, "utf8")).gitIcon === "emoji", "config does not save gitIcon emoji");
	});
} catch (error) {
	failures++;
	console.log(`FAIL setup: ${error.message}`);
} finally {
	rmSync(shared, { recursive: true, force: true });
	if (gitDir) rmSync(gitDir, { recursive: true, force: true });
	if (existsSync(config)) rmSync(config, { force: true });
	if (hadConfig && existsSync(backup)) {
		renameSync(backup, config);
	}
	if (hadLegacy && existsSync(legacyBackup) && !existsSync(legacy)) renameSync(legacyBackup, legacy);
}
process.exitCode = failures ? 1 : 0;
