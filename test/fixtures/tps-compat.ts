// Runs the installed senpi's builtin tps extension through loadBuiltinTps and prints the notice it gives
// for one streamed reply. A separate process, so the other suites' mock.module stubs cannot reach it.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { loadBuiltinTps, tpsModulePath } from "../../extension/statusbar/runtime.ts";

const omoBin = process.env.OMO_BIN;
const candidates = [
	...(omoBin ? [join(dirname(omoBin), "..", "node_modules", "@code-yeongyu", "senpi"), join(dirname(omoBin), "..", "..", "@code-yeongyu", "senpi")] : []),
	join(homedir(), ".bun", "install", "global", "node_modules", "@code-yeongyu", "senpi"),
];
const packageDir = candidates.find((dir) => existsSync(join(dir, "package.json")));
if (!packageDir) throw new Error(`senpi not found in ${candidates.join(", ")}: install omo-ai`);

let clock = 0;
performance.now = () => clock;

const factory = await loadBuiltinTps(packageDir);
const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
factory({ on: (name, handler) => handlers.set(name, handler) });

const message = {
	role: "assistant",
	content: [{ type: "text", text: "hi" }],
	usage: { input: 100, output: 60, cacheRead: 300, cacheWrite: 0 },
	stopReason: "stop",
};
const notices: string[] = [];
const ctx = { hasUI: true, mode: "tui", ui: { notify: (text: string) => notices.push(text) } };
handlers.get("agent_start")?.({}, ctx);
handlers.get("message_start")?.({ message }, ctx);
clock = 100;
handlers.get("message_update")?.({ message, assistantMessageEvent: { type: "text_delta" } }, ctx);
clock = 700;
handlers.get("message_update")?.({ message, assistantMessageEvent: { type: "text_delta" } }, ctx);
clock = 1000;
handlers.get("message_end")?.({ message }, ctx);
handlers.get("agent_end")?.({ messages: [message] }, ctx);

console.log(JSON.stringify({ path: tpsModulePath(packageDir), notices }));
