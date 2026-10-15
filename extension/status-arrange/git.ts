export const GIT_STATUS_KEY = "omo-git"

type GitIcon = "plain" | "emoji" | "nerd"

const GLYPHS: Record<GitIcon, string> = { plain: "±", emoji: "📝", nerd: "\ue702" }

/** The icon a git status entry is prefixed with. */
export function gitGlyph(icon: GitIcon): string {
	return GLYPHS[icon]
}

/** Changed files in `git status --porcelain` output: non-empty lines once trailing
 * whitespace is dropped, so a trailing newline or blank lines never count. */
export function countChanges(porcelain: string): number {
	let count = 0
	for (const line of porcelain.split("\n")) {
		if (line.trimEnd() !== "") count++
	}
	return count
}

/** `± 3`-style status text, or undefined when there is nothing to show. */
export function gitStatusText(count: number | undefined, icon: GitIcon = "plain"): string | undefined {
	if (count === undefined || count === 0) return undefined
	return `${gitGlyph(icon)} ${count}`
}

export type Exec = (
	command: string,
	args: string[],
	options: { cwd: string; timeout?: number },
) => Promise<{ stdout?: string; code?: number | null }>

/** Changed files in `cwd`, or undefined when git is missing, fails or the call throws. */
export async function readChangeCount(exec: Exec, cwd: string): Promise<number | undefined> {
	let result: { stdout?: string; code?: number | null }
	try {
		result = await exec("git", ["status", "--porcelain"], { cwd, timeout: 10000 })
	} catch {
		return undefined
	}
	if (result?.code !== 0) return undefined
	return countChanges(result.stdout ?? "")
}
