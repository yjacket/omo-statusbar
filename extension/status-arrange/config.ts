import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Separator = "space" | "pipe" | "dot" | "slash" | "brackets";
export type GitIcon = "plain" | "emoji" | "nerd";
export type Config = {
	version: 1;
	order: string[];
	hidden: string[];
	separator?: Separator;
	gitIcon?: GitIcon;
};

const SEPARATORS: readonly Separator[] = ["space", "pipe", "dot", "slash", "brackets"];
const GIT_ICONS: readonly GitIcon[] = ["plain", "emoji", "nerd"];

export const CONFIG_FILE = "status-arrange.json";

export function configPath(agentDir: string): string {
	return join(agentDir, CONFIG_FILE);
}

function emptyConfig(): Config {
	return { version: 1, order: [], hidden: [] };
}

function uniqueStrings(value: unknown[]): string[] {
	const seen = new Set<string>();
	return value.filter((item): item is string => {
		if (typeof item !== "string" || seen.has(item)) return false;
		seen.add(item);
		return true;
	});
}

export function normalizeConfig(raw: unknown): Config | undefined {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const value = raw as Record<string, unknown>;
	if (("order" in value && !Array.isArray(value.order)) || ("hidden" in value && !Array.isArray(value.hidden))) {
		return undefined;
	}
	const config: Config = {
		version: 1,
		order: uniqueStrings(Array.isArray(value.order) ? value.order : []),
		hidden: uniqueStrings(Array.isArray(value.hidden) ? value.hidden : []),
	};
	if ((SEPARATORS as readonly unknown[]).includes(value.separator)) config.separator = value.separator as Separator;
	if ((GIT_ICONS as readonly unknown[]).includes(value.gitIcon)) config.gitIcon = value.gitIcon as GitIcon;
	return config;
}

export function loadConfig(path: string): { config: Config; error?: string } {
	try {
		const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
		let raw: unknown;
		try {
			raw = JSON.parse(text);
		} catch {
			return { config: emptyConfig(), error: "Invalid JSON" };
		}
		const config = normalizeConfig(raw);
		if (!config) return { config: emptyConfig(), error: "Invalid config shape" };
		return { config };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { config: emptyConfig() };
		return { config: emptyConfig(), error: "Unable to read config" };
	}
}

export function saveConfig(path: string, config: Config): void {
	const temp = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`);
		renameSync(temp, path);
	} catch (error) {
		try {
			unlinkSync(temp);
		} catch {}
		throw error;
	}
}
