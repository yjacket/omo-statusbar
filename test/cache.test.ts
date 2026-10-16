import { afterEach, describe, expect, jest, mock, setSystemTime, test } from "bun:test"

let resolveTtl: (model: unknown) => number = () => 3600
mock.module("@earendil-works/pi-ai", () => ({ resolvePromptCacheTtlSeconds: (model: unknown) => resolveTtl(model) }))

const { CACHE_STATUS_KEY, cacheStatusText, cacheTtlSeconds, nextChange, trackCacheStatus } = await import(
	"../extension/statusbar/cache.ts?case=cache"
)

const M = 60000
const H = 60 * M

function fakePi() {
	const handlers = new Map<string, Array<(event: unknown, ctx: any) => unknown>>()
	return {
		on(name: string, handler: (event: unknown, ctx: any) => unknown) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler])
		},
		fire(name: string, event: unknown, ctx: unknown) {
			for (const handler of handlers.get(name) ?? []) handler(event, ctx)
		},
	}
}

function fakeCtx(branch: unknown[] = [], model: unknown = { id: "m" }) {
	return {
		hasUI: true,
		model,
		sessionManager: { getBranch: () => branch },
		ui: { setStatus: mock((_key: string, _value: string | undefined) => {}) },
	}
}

const reply = { message: { role: "assistant" } }

afterEach(() => {
	jest.useRealTimers()
	setSystemTime()
	resolveTtl = () => 3600
})

describe("cache status text", () => {
	test("names the status key", () => {
		expect(CACHE_STATUS_KEY).toBe("omo-cache")
	})

	test("counts minutes left, rounded up", () => {
		expect(cacheStatusText(0, 52 * M)).toBe("🔥 52m")
		expect(cacheStatusText(0, 51 * M + 1)).toBe("🔥 52m")
		expect(cacheStatusText(0, 1)).toBe("🔥 1m")
	})

	test("counts time since expiry, rounded down, in hours past the first hour", () => {
		expect(cacheStatusText(0, null)).toBe("🧊")
		expect(cacheStatusText(10, 10)).toBe("🧊")
		expect(cacheStatusText(M - 1, 0)).toBe("🧊")
		expect(cacheStatusText(12 * M + 5, 0)).toBe("🧊 12m")
		expect(cacheStatusText(59 * M + 59999, 0)).toBe("🧊 59m")
		expect(cacheStatusText(2 * H + 30 * M, 0)).toBe("🧊 2h")
	})

	test("re-arms at the next boundary where the text changes", () => {
		expect(nextChange(0, 52 * M)).toBe(M)
		expect(nextChange(0, 51 * M + 10)).toBe(10)
		expect(nextChange(12 * M + 5, 0)).toBe(M - 5)
		expect(nextChange(2 * H + 30 * M, 0)).toBe(30 * M)
	})
})

describe("cacheTtlSeconds", () => {
	test("passes a finite positive TTL through and rejects the rest", () => {
		expect(cacheTtlSeconds({ id: "m" })).toBe(3600)
		expect(cacheTtlSeconds(undefined)).toBeUndefined()
		resolveTtl = () => 0
		expect(cacheTtlSeconds({ id: "m" })).toBeUndefined()
		resolveTtl = () => {
			throw new Error("unknown model")
		}
		expect(cacheTtlSeconds({ id: "m" })).toBeUndefined()
	})
})

describe("trackCacheStatus", () => {
	test("a reply starts the countdown and the timer keeps it moving past expiry", () => {
		jest.useFakeTimers()
		setSystemTime(new Date(1_000_000))
		const pi = fakePi()
		trackCacheStatus(pi, () => 300)
		const ctx = fakeCtx()
		pi.fire("message_start", reply, ctx)
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-cache", "🔥 5m")
		jest.advanceTimersByTime(M)
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-cache", "🔥 4m")
		jest.advanceTimersByTime(4 * M)
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-cache", "🧊")
		jest.advanceTimersByTime(3 * M)
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-cache", "🧊 3m")
	})

	test("user messages leave the count alone", () => {
		const pi = fakePi()
		trackCacheStatus(pi, () => 300)
		const ctx = fakeCtx()
		pi.fire("message_start", { message: { role: "user" } }, ctx)
		expect(ctx.ui.setStatus).not.toHaveBeenCalled()
	})

	test("session_start picks up the last reply on the branch", () => {
		jest.useFakeTimers()
		setSystemTime(new Date(10 * H))
		const pi = fakePi()
		trackCacheStatus(pi, () => 3600)
		const branch = [
			{ type: "message", message: { role: "assistant", timestamp: 10 * H - 2 * H } },
			{ type: "message", message: { role: "assistant", timestamp: 10 * H - 8 * M } },
			{ type: "message", message: { role: "user", timestamp: 10 * H - M } },
		]
		const ctx = fakeCtx(branch)
		pi.fire("session_start", {}, ctx)
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-cache", "🔥 52m")
	})

	test("no reply yet or a model switch shows a cold cache without a count", () => {
		const pi = fakePi()
		trackCacheStatus(pi, () => 3600)
		const ctx = fakeCtx()
		pi.fire("session_start", {}, ctx)
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-cache", "🧊")
		pi.fire("message_start", reply, ctx)
		pi.fire("model_select", {}, ctx)
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-cache", "🧊")
	})

	test("an unknown TTL clears the status", () => {
		const pi = fakePi()
		trackCacheStatus(pi, () => undefined)
		const ctx = fakeCtx()
		pi.fire("message_start", reply, ctx)
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-cache", undefined)
	})

	test("a stale ctx ends the timer chain instead of throwing", () => {
		jest.useFakeTimers()
		const pi = fakePi()
		trackCacheStatus(pi, () => 300)
		const ctx = fakeCtx()
		pi.fire("message_start", reply, ctx)
		ctx.ui.setStatus.mockImplementation(() => {
			throw new Error("stale")
		})
		expect(() => jest.advanceTimersByTime(M)).not.toThrow()
		expect(jest.getTimerCount()).toBe(0)
	})

	test("session_shutdown clears the status and stops the timer", () => {
		jest.useFakeTimers()
		const pi = fakePi()
		trackCacheStatus(pi, () => 300)
		const ctx = fakeCtx()
		pi.fire("message_start", reply, ctx)
		pi.fire("session_shutdown", {}, ctx)
		expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("omo-cache", undefined)
		expect(jest.getTimerCount()).toBe(0)
	})
})
