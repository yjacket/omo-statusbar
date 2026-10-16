export type Separator = "space" | "pipe" | "dot" | "slash" | "brackets";
export type GitIcon = "plain" | "emoji" | "nerd";
export type Config = {
	version: 1;
	order: string[];
	hidden: string[];
	separator?: Separator;
	gitIcon?: GitIcon;
};

export const SEPARATORS: readonly Separator[] = ["space", "pipe", "dot", "slash", "brackets"];
export const GIT_ICONS: readonly GitIcon[] = ["plain", "emoji", "nerd"];

export function emptyConfig(): Config {
	return { version: 1, order: [], hidden: [] };
}

const byLocale = (a: string, b: string): number => a.localeCompare(b);

export function mergeKeys(order: readonly string[], keys: Iterable<string>): string[] {
	const known = new Set(order);
	const unseen = [...new Set(keys)].filter((key) => !known.has(key)).sort(byLocale);
	if (unseen.length === 0) return order as string[];

	const result = [...order];
	for (const key of unseen) {
		let predecessor = -1;
		for (let i = 0; i < result.length; i++) {
			if (result[i].localeCompare(key) < 0 && (predecessor < 0 || result[i].localeCompare(result[predecessor]) > 0)) {
				predecessor = i;
			}
		}
		result.splice(predecessor + 1, 0, key);
	}
	return result;
}

const PREFIX: Record<Separator, string | undefined> = {
	space: undefined,
	pipe: "|",
	dot: "·",
	slash: "/",
	brackets: undefined,
};

export function arrangeStatuses(
	statuses: ReadonlyMap<string, string>,
	order: readonly string[],
	hidden: ReadonlySet<string>,
	separator: Separator = "space",
): Map<string, string> {
	const full = mergeKeys(order, statuses.keys());
	const result = new Map<string, string>();
	for (const key of full) {
		if (!statuses.has(key) || hidden.has(key)) continue;
		const index = result.size;
		const text = statuses.get(key) as string;
		let value = text;
		if (separator === "brackets") value = `[${text}]`;
		else if (index > 0) {
			const ch = PREFIX[separator];
			if (ch !== undefined) value = `${ch} ${text}`;
		}
		result.set(String(index).padStart(4, "0"), value);
	}
	return result;
}

export function defaultOrder(keys: Iterable<string>): string[] {
	return [...new Set(keys)].sort(byLocale);
}
