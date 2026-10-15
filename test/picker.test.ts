import { describe, expect, mock, test } from "bun:test";
import { StatusPicker } from "../extension/status-arrange/picker.ts";
import { displayWidth } from "../extension/status-arrange/text.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

describe("StatusPicker", () => {
	test("renders and toggles, saves, and confirms close", () => {
		const preview = mock((_: string[], __: string[]) => {});
		const save = mock((_: string[], __: string[]) => undefined as string | undefined);
		const close = mock(() => {});
		const picker = new StatusPicker(theme, {
			order: ["a", "b"], statuses: () => new Map([["a", "A"], ["b", "B"]]), hidden: [],
			onPreview: preview, onSave: save, onClose: close,
		});
		const rendered = picker.render(80).join("\n");
		expect(rendered).toContain("상태줄 정리");
		expect(rendered).toContain("↑↓ 이동");
		expect(rendered).toContain("▸");
		picker.handleInput("x");
		const toggled = picker.render(80).join("\n");
		expect(toggled).toContain("숨김");
		expect(toggled).toContain("*");
		expect(toggled).toContain("저장 안 된 변경 1건");
		expect(preview).toHaveBeenCalledWith(["a", "b"], ["a"]);
		picker.handleInput("s");
		expect(save).toHaveBeenCalledWith(["a", "b"], ["a"]);
		expect(picker.render(80).join("\n")).toContain("저장됨");
		picker.handleInput("q");
	});

	test("moves the focused item to the top and the bottom", () => {
		const preview = mock((_: string[], __: string[]) => {});
		const picker = new StatusPicker(theme, {
			order: ["a", "b", "c"], statuses: () => new Map([["a", "A"], ["b", "B"], ["c", "C"]]), hidden: [],
			onPreview: preview, onSave: () => undefined, onClose: () => {},
		});
		picker.handleInput("\x1b[F");
		picker.handleInput("T");
		expect(preview).toHaveBeenLastCalledWith(["c", "a", "b"], []);
		picker.handleInput("B");
		expect(preview).toHaveBeenLastCalledWith(["a", "b", "c"], []);
		expect(picker.render(80).join("\n")).toContain("T/B 맨 위·아래로");
	});

	test("asks once before discarding, and another key cancels the close", () => {
		const preview = mock((_: string[], __: string[]) => {});
		const close = mock(() => {});
		const picker = new StatusPicker(theme, {
			order: ["a", "b"], statuses: () => new Map([["a", "A"], ["b", "B"]]), hidden: [],
			onPreview: preview, onSave: () => undefined, onClose: close,
		});
		picker.handleInput("x");
		picker.handleInput("q");
		expect(close).not.toHaveBeenCalled();
		expect(picker.render(80).join("\n")).toContain("한 번 더 누르면 버립니다");
		picker.handleInput("j");
		expect(picker.render(80).join("\n")).not.toContain("한 번 더 누르면 버립니다");
		picker.handleInput("\x1b");
		picker.handleInput("\x1b");
		expect(preview).toHaveBeenLastCalledWith(["a", "b"], []);
		expect(close).toHaveBeenCalledTimes(1);
	});

	test("keeps rendered lines cell-fitted and preserves live refresh", () => {
		const live = new Map([["a", "한글"], ["b", "B"]]);
		const picker = new StatusPicker(theme, {
			order: ["a", "b"], statuses: () => live, hidden: [],
			onPreview: () => {}, onSave: () => undefined, onClose: () => {},
		});
		picker.handleInput("x");
		live.set("a", "수정됨");
		live.delete("b");
		live.set("c", "C");
		for (const width of [80, 40]) {
			const lines = picker.render(width);
			expect(lines.every((line) => displayWidth(line) === width)).toBe(true);
			expect(lines.join("\n")).toContain("수정됨");
			expect(lines.join("\n")).toContain("(지금 없음)");
			expect(lines.join("\n")).toContain("c");
			expect(lines.join("\n")).toContain("저장 안 된 변경 1건");
		}
	});

	test("removes absent keys, refuses present keys, and resets", () => {
		const picker = new StatusPicker(theme, {
			order: ["a", "b"], statuses: () => new Map([["a", "A"]]), hidden: [],
			onPreview: () => {}, onSave: () => undefined, onClose: () => {},
		});
		picker.handleInput("d");
		expect(picker.render(80).join("\n")).toContain("지금 표시 중인 항목은 지울 수 없습니다");
		picker.handleInput("j");
		picker.handleInput("down");
		picker.handleInput("d");
		expect(picker.render(80).join("\n")).not.toContain("  b ");
		picker.handleInput("r");
		expect(picker.render(80).join("\n")).not.toContain("  b ");
	});
});
