import { describe, expect, mock, test } from "bun:test";
import { StatusPicker, type PickerOptions, type PickerState } from "../extension/statusbar/picker.ts";
import { displayWidth } from "../extension/statusbar/text.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

const make = (overrides: Partial<PickerOptions> = {}): StatusPicker => new StatusPicker(theme, {
	order: ["a", "b"], statuses: () => new Map([["a", "A"], ["b", "B"]]), hidden: [],
	separator: "space", gitIcon: "plain",
	onPreview: () => {}, onSave: () => undefined, onClose: () => {},
	...overrides,
});

describe("StatusPicker", () => {
	test("renders and toggles, saves, and confirms close", () => {
		const preview = mock((_state: PickerState) => {});
		const save = mock((_state: PickerState) => undefined as string | undefined);
		const close = mock(() => {});
		const picker = make({ onPreview: preview, onSave: save, onClose: close });
		const rendered = picker.render(80).join("\n");
		expect(rendered).toContain("상태줄 정리");
		expect(rendered).toContain("↑↓ 이동");
		expect(rendered).toContain("▸");
		picker.handleInput("x");
		const toggled = picker.render(80).join("\n");
		expect(toggled).toContain("숨김");
		expect(toggled).toContain("*");
		expect(toggled).toContain("저장 안 된 변경 1건");
		expect(preview).toHaveBeenCalledWith({ order: ["a", "b"], hidden: ["a"], separator: "space", gitIcon: "plain" });
		picker.handleInput("s");
		expect(save).toHaveBeenCalledWith({ order: ["a", "b"], hidden: ["a"], separator: "space", gitIcon: "plain" });
		expect(picker.render(80).join("\n")).toContain("저장됨");
		picker.handleInput("q");
		expect(close).toHaveBeenCalledTimes(1);
	});

	test("moves the focused item to the top and the bottom", () => {
		const preview = mock((_state: PickerState) => {});
		const picker = make({ order: ["a", "b", "c"], statuses: () => new Map([["a", "A"], ["b", "B"], ["c", "C"]]), onPreview: preview });
		picker.handleInput("\x1b[F");
		picker.handleInput("T");
		expect(preview).toHaveBeenLastCalledWith({ order: ["c", "a", "b"], hidden: [], separator: "space", gitIcon: "plain" });
		picker.handleInput("B");
		expect(preview).toHaveBeenLastCalledWith({ order: ["a", "b", "c"], hidden: [], separator: "space", gitIcon: "plain" });
		expect(picker.render(80).join("\n")).toContain("T/B 맨 위·아래로");
	});

	test("asks once before discarding, and another key cancels the close", () => {
		const preview = mock((_state: PickerState) => {});
		const close = mock(() => {});
		const picker = make({ onPreview: preview, onClose: close });
		picker.handleInput("x");
		picker.handleInput("q");
		expect(close).not.toHaveBeenCalled();
		expect(picker.render(80).join("\n")).toContain("한 번 더 누르면 버립니다");
		picker.handleInput("j");
		expect(picker.render(80).join("\n")).not.toContain("한 번 더 누르면 버립니다");
		picker.handleInput("\x1b");
		picker.handleInput("\x1b");
		expect(preview).toHaveBeenLastCalledWith({ order: ["a", "b"], hidden: [], separator: "space", gitIcon: "plain" });
		expect(close).toHaveBeenCalledTimes(1);
	});

	test("keeps rendered lines cell-fitted and preserves live refresh", () => {
		const live = new Map([["a", "한글"], ["b", "B"]]);
		const picker = make({ statuses: () => live });
		picker.handleInput("x");
		live.set("a", "수정됨");
		live.delete("b");
		live.set("c", "C");
		for (const width of [80, 40, 76]) {
			const lines = picker.render(width);
			expect(lines.every((line) => displayWidth(line) === width)).toBe(true);
			expect(lines.join("\n")).toContain("수정됨");
			expect(lines.join("\n")).toContain("(지금 없음)");
			expect(lines.join("\n")).toContain("c");
			expect(lines.join("\n")).toContain("저장 안 된 변경 1건");
		}
	});

	test("removes absent keys, refuses present keys, and resets", () => {
		const picker = make({ statuses: () => new Map([["a", "A"]]) });
		picker.handleInput("d");
		expect(picker.render(80).join("\n")).toContain("지금 표시 중인 항목은 지울 수 없습니다");
		picker.handleInput("j");
		picker.handleInput("down");
		picker.handleInput("d");
		expect(picker.render(80).join("\n")).not.toContain("  b ");
		picker.handleInput("r");
		expect(picker.render(80).join("\n")).not.toContain("  b ");
	});

	test("p cycles the separator and previews it", () => {
		const seen: PickerState[] = [];
		const picker = make({ onPreview: (state) => seen.push(state) });
		for (const expected of ["pipe", "dot", "slash", "brackets", "space"]) {
			picker.handleInput("p");
			expect(seen.at(-1)?.separator).toBe(expected);
		}
	});

	test("g cycles the git icon and previews it", () => {
		const seen: PickerState[] = [];
		const picker = make({ onPreview: (state) => seen.push(state) });
		for (const expected of ["emoji", "nerd", "plain"]) {
			picker.handleInput("g");
			expect(seen.at(-1)?.gitIcon).toBe(expected);
		}
	});

	test("shows the staged separator and git icon in the settings line", () => {
		const picker = make({ onPreview: () => {} });
		picker.handleInput("p");
		expect(picker.render(80).join("\n")).toContain("구분자 |");
		picker.handleInput("g");
		expect(picker.render(80).join("\n")).toContain("git 아이콘 📝");
	});

	test("counts a separator change as one unsaved change and clears 저장됨", () => {
		const picker = make();
		picker.handleInput("s");
		expect(picker.render(80).join("\n")).toContain("저장됨");
		picker.handleInput("p");
		const rendered = picker.render(80).join("\n");
		expect(rendered).toContain("저장 안 된 변경 1건");
		expect(rendered).not.toContain("저장됨");
	});

	test("discarding restores the saved separator and git icon", () => {
		const preview = mock((_state: PickerState) => {});
		const close = mock(() => {});
		const picker = make({ onPreview: preview, onClose: close });
		picker.handleInput("p");
		picker.handleInput("g");
		picker.handleInput("q");
		picker.handleInput("q");
		expect(preview).toHaveBeenLastCalledWith({ order: ["a", "b"], hidden: [], separator: "space", gitIcon: "plain" });
		expect(close).toHaveBeenCalledTimes(1);
	});

	test("r resets the separator and git icon", () => {
		const seen: PickerState[] = [];
		const picker = make({ separator: "pipe", gitIcon: "emoji", hidden: ["a"], order: ["b", "a"], onPreview: (state) => seen.push(state) });
		picker.handleInput("r");
		expect(seen.at(-1)).toEqual({ order: ["a", "b"], hidden: [], separator: "space", gitIcon: "plain" });
		const rendered = picker.render(80).join("\n");
		expect(rendered).toContain("구분자 공백 · git 아이콘 ±");
	});

	test("lists the separator, git icon keys in the help line", () => {
		const rendered = make().render(80).join("\n");
		expect(rendered).toContain("p 구분자");
		expect(rendered).toContain("g git 아이콘");
	});
});
