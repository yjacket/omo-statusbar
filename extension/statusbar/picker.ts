import {
	defaultOrder,
	GIT_ICONS,
	type GitIcon,
	mergeKeys,
	SEPARATORS,
	type Separator,
} from "./arrange.ts";
import { gitGlyph } from "./git.ts";
import { decodeKey } from "./keys.ts";
import { displayWidth, fitCells, padCells, plainText } from "./text.ts";

export type PickerState = {
	order: string[];
	hidden: string[];
	separator: Separator;
	gitIcon: GitIcon;
};

export type PickerOptions = {
	order: string[];
	statuses: () => ReadonlyMap<string, string>;
	hidden: string[];
	separator: Separator;
	gitIcon: GitIcon;
	maxRows?: number;
	keybindings?: { matches(data: string, id: string): boolean };
	onPreview(state: PickerState): void;
	onSave(state: PickerState): string | undefined;
	onClose(): void;
};

const SEPARATOR_LABELS: Record<Separator, string> = {
	space: "공백",
	pipe: "|",
	dot: "·",
	slash: "/",
	brackets: "[]",
};

function nextIn<T>(list: readonly T[], current: T): T {
	return list[(list.indexOf(current) + 1) % list.length] as T;
}

export class StatusPicker {
	private savedOrder: string[];
	private order: string[];
	private savedHidden: string[];
	private hidden: string[];
	private savedSeparator: Separator;
	private separator: Separator;
	private savedGitIcon: GitIcon;
	private gitIcon: GitIcon;
	private cursor = 0;
	private scroll = 0;
	private message: { text: string; tone: "warning" | "error" } | undefined;
	private savedMessage = false;
	private pendingClose = false;

	constructor(
		private theme: {
			fg(color: string, text: string): string;
			bold(text: string): string;
		},
		private options: PickerOptions,
	) {
		this.savedOrder = [...options.order];
		this.order = [...options.order];
		this.savedHidden = [...options.hidden];
		this.hidden = [...options.hidden];
		this.savedSeparator = options.separator;
		this.separator = options.separator;
		this.savedGitIcon = options.gitIcon;
		this.gitIcon = options.gitIcon;
	}

	private stagedState(): PickerState {
		return {
			order: [...this.order],
			hidden: [...this.hidden],
			separator: this.separator,
			gitIcon: this.gitIcon,
		};
	}

	private savedState(): PickerState {
		return {
			order: [...this.savedOrder],
			hidden: [...this.savedHidden],
			separator: this.savedSeparator,
			gitIcon: this.savedGitIcon,
		};
	}

	private changedKeys(): number {
		const savedPositions = new Map(
			this.savedOrder.map((key, index) => [key, index]),
		);
		const positions = new Map(this.order.map((key, index) => [key, index]));
		const savedHidden = new Set(this.savedHidden);
		const hidden = new Set(this.hidden);
		let count = this.order.filter(
			(key) =>
				savedPositions.get(key) !== positions.get(key) ||
				savedHidden.has(key) !== hidden.has(key),
		).length;
		if (this.separator !== this.savedSeparator) count++;
		if (this.gitIcon !== this.savedGitIcon) count++;
		return count;
	}

	private changed(): boolean {
		return this.changedKeys() > 0;
	}

	private preview(): void {
		this.options.onPreview(this.stagedState());
	}

	handleInput(data: string): void {
		const key = decodeKey(data, this.options.keybindings);
		if (key === undefined) return;
		this.message = undefined;
		const statuses = this.options.statuses();
		const index = this.cursor;
		const focused = this.order[index];
		let changed = false;
		switch (key) {
			case "up":
			case "k":
				this.cursor = Math.max(0, this.cursor - 1);
				break;
			case "down":
			case "j":
				this.cursor = Math.min(this.order.length - 1, this.cursor + 1);
				break;
			case "pageUp":
				this.cursor = Math.max(
					0,
					this.cursor - (this.options.maxRows ?? 15) + 1,
				);
				break;
			case "pageDown":
				this.cursor = Math.min(
					this.order.length - 1,
					this.cursor + (this.options.maxRows ?? 15) - 1,
				);
				break;
			case "home":
				this.cursor = 0;
				break;
			case "end":
				this.cursor = this.order.length - 1;
				break;
			case "space":
			case "x":
				if (focused !== undefined) {
					this.hidden = this.hidden.includes(focused)
						? this.hidden.filter((item) => item !== focused)
						: [...this.hidden, focused];
					changed = true;
				}
				break;
			case "shiftUp":
			case "K":
				if (index > 0) {
					[this.order[index - 1], this.order[index]] = [
						this.order[index],
						this.order[index - 1],
					];
					this.cursor--;
					changed = true;
				}
				break;
			case "shiftDown":
			case "J":
				if (index >= 0 && index < this.order.length - 1) {
					[this.order[index + 1], this.order[index]] = [
						this.order[index],
						this.order[index + 1],
					];
					this.cursor++;
					changed = true;
				}
				break;
			case "T":
			case "B":
				if (focused !== undefined) {
					const rest = this.order.filter((item) => item !== focused);
					const next = key === "T" ? [focused, ...rest] : [...rest, focused];
					changed = next.some((item, i) => item !== this.order[i]);
					this.order = next;
					this.cursor = key === "T" ? 0 : next.length - 1;
				}
				break;
			case "p":
				this.separator = nextIn(SEPARATORS, this.separator);
				changed = true;
				break;
			case "g":
				this.gitIcon = nextIn(GIT_ICONS, this.gitIcon);
				changed = true;
				break;
			case "r":
				this.order = defaultOrder(this.order);
				this.hidden = [];
				this.separator = "space";
				this.gitIcon = "plain";
				this.cursor = Math.min(this.cursor, this.order.length - 1);
				changed = true;
				break;
			case "d":
				if (focused !== undefined) {
					if (statuses.has(focused))
						this.message = {
							text: "지금 표시 중인 항목은 지울 수 없습니다",
							tone: "warning",
						};
					else {
						this.order = this.order.filter((item) => item !== focused);
						this.hidden = this.hidden.filter((item) => item !== focused);
						this.cursor = Math.min(this.cursor, this.order.length - 1);
						changed = true;
					}
				}
				break;
			case "s": {
				const error = this.options.onSave(this.stagedState());
				if (error === undefined) {
					this.savedOrder = [...this.order];
					this.savedHidden = [...this.hidden];
					this.savedSeparator = this.separator;
					this.savedGitIcon = this.gitIcon;
					this.savedMessage = true;
					this.message = undefined;
				} else this.message = { text: error, tone: "error" };
				break;
			}
			case "q":
			case "escape":
				if (this.pendingClose || !this.changed()) {
					if (this.changed()) this.options.onPreview(this.savedState());
					this.options.onClose();
				} else {
					this.pendingClose = true;
				}
				return;
			default:
				break;
		}
		if (key !== "q" && key !== "escape") this.pendingClose = false;
		if (changed) {
			this.message = undefined;
			this.savedMessage = false;
			this.preview();
		}
	}

	invalidate(): void {}

	render(width: number): string[] {
		const statuses = this.options.statuses();
		const savedMerged = mergeKeys(this.savedOrder, statuses.keys());
		if (savedMerged !== this.savedOrder) this.savedOrder = savedMerged;
		const stagedMerged = mergeKeys(this.order, statuses.keys());
		if (stagedMerged !== this.order) this.order = stagedMerged;
		this.cursor = Math.max(0, Math.min(this.cursor, this.order.length - 1));

		const boxed = width >= 20;
		const inner = Math.max(1, width - (boxed ? 4 : 0));
		const limit = this.options.maxRows ?? 15;
		if (this.cursor < this.scroll) this.scroll = this.cursor;
		if (this.cursor >= this.scroll + limit)
			this.scroll = this.cursor - limit + 1;
		const savedPositions = new Map(this.savedOrder.map((key, i) => [key, i]));
		const orderPositions = new Map(this.order.map((key, i) => [key, i]));
		const savedHidden = new Set(this.savedHidden);
		const hidden = new Set(this.hidden);
		const accent = (s: string) => this.theme.bold(this.theme.fg("accent", s));
		const dim = (s: string) => this.theme.fg("dim", s);
		const lines: string[] = [padCells(accent("상태줄 정리"), inner)];
		lines.push(
			padCells(
				dim(
					`구분자 ${SEPARATOR_LABELS[this.separator]} · git 아이콘 ${gitGlyph(this.gitIcon)}`,
				),
				inner,
			),
		);
		const labels = this.order.map((key) =>
			key !== key.trim() || key === "" ? JSON.stringify(key) : key,
		);
		const labelWidth = Math.min(28, Math.max(0, ...labels.map(displayWidth)));
		for (const [offset, key] of this.order
			.slice(this.scroll, this.scroll + limit)
			.entries()) {
			const i = this.scroll + offset;
			const isHidden = hidden.has(key);
			const differs =
				savedPositions.get(key) !== orderPositions.get(key) ||
				savedHidden.has(key) !== isHidden;
			const state =
				padCells(isHidden ? "숨김" : "보임", 4) + (differs ? "*" : " ");
			const text = statuses.get(key);
			const label = padCells(labels[i], labelWidth);
			const preview = text === undefined ? "(지금 없음)" : plainText(text);
			let row = `${i === this.cursor ? "▸ " : "  "}${state}  ${label}  ${preview}`;
			row = padCells(row, inner);
			if (i === this.cursor) row = accent(row);
			else if (isHidden) row = dim(row);
			lines.push(row);
		}
		let status: string;
		if (this.pendingClose)
			status = this.theme.fg(
				"warning",
				"저장 안 된 변경이 있습니다 · 한 번 더 누르면 버립니다",
			);
		else if (this.message)
			status = this.theme.fg(this.message.tone, this.message.text);
		else if (this.changed())
			status = this.theme.fg(
				"warning",
				`저장 안 된 변경 ${this.changedKeys()}건 · s 저장`,
			);
		else if (this.savedMessage) status = this.theme.fg("success", "저장됨");
		else status = "";
		lines.push(padCells(status, inner));
		const items = [
			"↑↓ 이동",
			"x 보이기/숨기기",
			"K/J 위·아래로",
			"T/B 맨 위·아래로",
			"p 구분자",
			"g git 아이콘",
			"r 기본값",
			"d 목록에서 지우기",
			"s 저장",
			"q 닫기",
		];
		let help = "";
		for (const item of items) {
			const fitted = fitCells(item, inner);
			if (help && displayWidth(help) + 3 + displayWidth(fitted) > inner) {
				lines.push(padCells(dim(help), inner));
				help = fitted;
			} else help += `${help ? " · " : ""}${fitted}`;
		}
		lines.push(padCells(dim(help), inner));
		if (boxed) {
			const border = (s: string) => this.theme.fg("border", s);
			const top = `┌${"─".repeat(Math.max(0, inner + 2))}┐`;
			const bottom = `└${"─".repeat(Math.max(0, inner + 2))}┘`;
			return [
				top,
				...lines.map(
					(line) => `${border("│")} ${padCells(line, inner)} ${border("│")}`,
				),
				bottom,
			].map((line) => padCells(line, width));
		}
		return lines.map((line) => padCells(line, width));
	}
}
