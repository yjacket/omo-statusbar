import * as piAi from "@earendil-works/pi-ai"

export const CACHE_STATUS_KEY = "omo-cache"

const MINUTE = 60000
const HOUR = 60 * MINUTE

/** Prompt cache lifetime senpi knows for `model`, in seconds, or undefined. */
export function cacheTtlSeconds(model: unknown): number | undefined {
	const resolve = (piAi as any).resolvePromptCacheTtlSeconds
	if (!model || typeof resolve !== "function") return undefined
	try {
		const seconds = resolve(model)
		return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
	} catch {
		return undefined
	}
}

/** `🔥 52m` with minutes left (rounded up), `🧊 12m` / `🧊 2h` with time since it expired
 * (rounded down), `🧊` for a cache that was never warmed. */
export function cacheStatusText(now: number, until: number | null): string {
	if (until === null) return "🧊"
	const left = until - now
	if (left > 0) return `🔥 ${Math.ceil(left / MINUTE)}m`
	const cold = -left
	if (cold < MINUTE) return "🧊"
	return cold < HOUR ? `🧊 ${Math.floor(cold / MINUTE)}m` : `🧊 ${Math.floor(cold / HOUR)}h`
}

/** Milliseconds until `cacheStatusText` would change. */
export function nextChange(now: number, until: number): number {
	const left = until - now
	if (left > 0) return left % MINUTE || MINUTE
	const cold = -left
	const unit = cold < HOUR ? MINUTE : HOUR
	return unit - (cold % unit)
}

/** Keeps the `omo-cache` footer status: counts the prompt cache down from the last reply,
 * then counts the time since it expired. Nothing is shown when senpi knows no TTL. */
export function trackCacheStatus(pi: any, ttlSeconds: (model: unknown) => number | undefined = cacheTtlSeconds): void {
	let until: number | null | undefined // undefined: no TTL, show nothing; null: never warmed
	let statusCtx: any
	let timer: ReturnType<typeof setTimeout> | undefined

	// Redraws the status, then re-arms itself for the moment the text changes. It runs outside
	// senpi's handler dispatch, so a stale ctx (reload, session switch) ends the chain.
	const show = () => {
		clearTimeout(timer)
		timer = undefined
		const now = Date.now()
		try {
			if (!statusCtx?.hasUI) return
			statusCtx.ui.setStatus(CACHE_STATUS_KEY, until === undefined ? undefined : cacheStatusText(now, until))
		} catch {
			return
		}
		if (until === undefined || until === null) return
		timer = setTimeout(show, nextChange(now, until))
		timer.unref?.()
	}

	const track = (ctx: any, startedAt: number | undefined) => {
		statusCtx = ctx
		const ttl = ttlSeconds(ctx?.model)
		until = ttl === undefined ? undefined : startedAt === undefined ? null : startedAt + ttl * 1000
		show()
	}

	pi.on("message_start", (event: any, ctx: any) => {
		if (event?.message?.role === "assistant") track(ctx, Date.now())
	})
	// Start, reload and session switch: pick the count up from the last reply on the branch.
	pi.on("session_start", (_event: unknown, ctx: any) => {
		let startedAt: unknown
		try {
			const branch = ctx?.sessionManager?.getBranch?.() ?? []
			const replies = branch.filter((entry: any) => entry?.type === "message" && entry.message?.role === "assistant")
			startedAt = replies.at(-1)?.message?.timestamp
		} catch {
			startedAt = undefined
		}
		track(ctx, typeof startedAt === "number" && Number.isFinite(startedAt) ? startedAt : undefined)
	})
	// The prompt cache belongs to one model, so a newly selected model starts cold.
	pi.on("model_select", (_event: unknown, ctx: any) => track(ctx, undefined))
	pi.on("session_shutdown", () => {
		until = undefined
		show()
		statusCtx = undefined
	})
}
