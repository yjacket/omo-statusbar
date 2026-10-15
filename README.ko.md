# omo-status-arrange

[English](README.md)

omo 푸터의 두 번째 줄에는 확장들이 올린 상태 항목이 키 순서로 정렬되어 나옵니다. 이 확장을 쓰면 그 순서를 직접 정하고, 보고 싶지 않은 항목은 숨길 수 있습니다. omo 푸터는 그대로 두고, 두 번째 줄의 상태 항목만 바꿉니다.

## 설치

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/yjacket/omo-status-arrange/master/install.ps1 | iex
```

Linux, macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/yjacket/omo-status-arrange/master/install.sh | sh
```

스크립트는 최신 `master`를 내려받아 `extension/status-arrange`를 `~/.omo/agent/extensions/status-arrange`에 복사합니다. `OMO_CODING_AGENT_DIR`이 설정되어 있으면 그 폴더에 복사합니다. 복사가 끝나면 실행 중인 세션에서 `/reload`를 입력하세요. 클론에서 `.\install.ps1` 또는 `sh install.sh`를 실행하면 내려받지 않고 그 체크아웃을 설치합니다.

## 사용법

`/status-arrange`를 입력하면 상태 항목 목록이 열립니다.

| 키 | 동작 |
| --- | --- |
| `↑` `↓` / `k` `j` | 커서 이동 |
| `PgUp` `PgDn` `Home` `End` | 목록 넘기기 |
| `x` 또는 `Space` | 항목 보이기/숨기기 |
| `K` `J` 또는 `Shift+↑` `Shift+↓` | 항목을 위아래로 옮기기 |
| `T` / `B` | 항목을 맨 위 / 맨 아래로 옮기기 |
| `r` | 기본 순서로 되돌리기 |
| `d` | 지금 표시되지 않는 항목 지우기 |
| `p` | 구분자 바꾸기: 공백, `\|`, `·`, `/`, `[]`(항목마다 감쌈) |
| `g` | git 아이콘 바꾸기: `±`, `📝`, Nerd Font 글리프 U+E702(터미널 글꼴이 Nerd Font여야 함) |
| `s` | 저장 |
| `q` / `Esc` | 닫기. 저장하지 않은 변경이 있으면 한 번 묻습니다 |

## 동작 방식

senpi는 푸터 상태를 키 순서로 정렬합니다. 이 확장은 푸터의 상태 소스를 감싸고, 고른 순서대로 정렬되도록 키 이름을 바꿉니다. 처음 보는 항목은 알파벳 순서상 바로 앞 항목 뒤에 나옵니다.

이 확장은 자기 상태 `omo-git`도 올립니다. 표시는 `± N`이고, N은 `git status --porcelain` 기준 커밋하지 않은 파일 수입니다(수정, 스테이징, 추적 안 됨 포함). 세션을 시작할 때와 답이 끝날 때마다 갱신되고, 작업 트리가 깨끗하거나 저장소가 아니면 숨겨집니다. 다른 상태처럼 편집기에서 옮기거나 숨길 수 있습니다. 항목 사이 구분자는 omo가 아니라 이 확장이 넣습니다.

설정은 `<agentDir>/status-arrange.json`에 저장됩니다:

```json
{
	"version": 1,
	"order": ["cache-ttl", "  omo-native", "goal"],
	"hidden": ["og-promo"],
	"separator": "pipe",
	"gitIcon": "plain"
}
```

키는 앞 공백까지 확장이 정한 그대로 저장됩니다. 이 파일은 omo 런타임 밖에 있어서 omo나 omo-ai를 업데이트해도 남아 있습니다. `separator`나 `gitIcon`이 없으면 공백과 `±`를 씁니다.

## 제한

- 다른 확장이 `setFooter`로 자기 푸터를 설치하면, 시작할 때의 캡처 과정에서 그 푸터가 초기화될 수 있습니다.
- 대화형 TUI에서만 동작합니다.

## 제거

`<agentDir>/extensions/status-arrange`를 지우세요. `<agentDir>/status-arrange.json`도 지워도 됩니다. 그다음 `/reload`를 입력하세요.
