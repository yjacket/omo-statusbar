import { existsSync } from "node:fs";
import { join } from "node:path";

export default function qaStatuses(pi) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus("aa-qa", "QA-A");
		ctx.ui.setStatus("zz-qa", "QA-Z");
		if (existsSync(join(process.cwd(), ".qa-new-key"))) {
			ctx.ui.setStatus("ab-qa", "QA-B");
		}
	});
}
