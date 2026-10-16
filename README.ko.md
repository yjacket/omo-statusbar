# omo-statusbar

[English](README.md)

omo 푸터의 두 번째 줄에는 확장들이 올린 상태 항목이 키 순서로 정렬되어 나옵니다. 이 확장을 쓰면 그 순서를 직접 정하고, 보고 싶지 않은 항목은 숨길 수 있습니다. omo 푸터는 그대로 두고, 두 번째 줄의 상태 항목만 바꿉니다.

## 설치

```sh
omo install git:github.com/yjacket/omo-statusbar
```

omo가 저장소를 `<agentDir>/git/github.com/yjacket/omo-statusbar`에 클론하고 `<agentDir>/settings.json`의 `packages`에 등록합니다. 실행 중인 세션에서 `/reload`를 입력하세요.

업데이트는 `omo update --extensions`(설치된 패키지 전부) 또는 `omo update git:github.com/yjacket/omo-statusbar`를 실행한 뒤 `/reload`를 입력하세요.

예전 복사 스크립트로 설치했다면:

- `<agentDir>/extensions/status-arrange`를 지우세요. 남겨 두면 패키지와 함께 두 번 로드됩니다. `status-arrange.json`의 설정은 처음 시작할 때 `statusbar.json`으로 옮겨집니다.
- omo-tps-plus를 설치했다면 `<agentDir>/extensions/tps.js`를 지우세요. 그 푸터 상태는 이제 이 확장의 `omo-cache`입니다. 다음 시작 때 omo가 기본 tps 파일을 다시 씁니다.

## 사용법

`/statusbar`를 입력하면 상태 항목 목록이 열립니다.

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

이 확장은 자기 상태 `omo-git`도 올립니다. 표시는 `±N`이고, N은 `git status --porcelain` 기준 커밋하지 않은 파일 수입니다(수정, 스테이징, 추적 안 됨 포함). 세션을 시작할 때와 답이 끝날 때마다 갱신되고, 작업 트리가 깨끗하거나 저장소가 아니면 숨겨집니다. 다른 상태처럼 편집기에서 옮기거나 숨길 수 있습니다.

`omo-cache`도 올립니다. 마지막 답부터 센 프롬프트 캐시 수명입니다:

```
🔥 52m    캐시가 살아 있음. 남은 분(올림)
🧊 12m    캐시가 만료된 지 12분(1시간이 넘으면 🧊 2h)
🧊        아직 답이 없음, 모델 전환, 또는 만료된 지 1분 미만
```

수명은 senpi의 모델별 TTL(`resolvePromptCacheTtlSeconds`)입니다. Claude 구독은 1시간, Anthropic API 키는 5분입니다. 답이 올 때마다 다시 시작합니다. 세션 시작, 리로드, 전환 때는 대화의 마지막 답부터 이어서 셉니다. senpi가 모델의 TTL을 모르면 숨겨집니다. omo-tps-plus의 푸터 상태를 대신하므로, 그 확장이 아직 설치돼 있으면 `cache-ttl` 항목을 숨기거나 제거하세요.

항목 사이 구분자는 omo가 아니라 이 확장이 넣습니다.

설정은 `<agentDir>/statusbar.json`에 저장됩니다:

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
- `omo-cache`는 시계만 봅니다. 세션이 쉬는 동안 keep-alive 요청으로 캐시가 갱신된 것이나, Claude 구독이 사용 한도를 넘어 5분 TTL로 떨어진 것은 알 수 없습니다.

## 제거

```sh
omo remove git:github.com/yjacket/omo-statusbar
```

`<agentDir>/statusbar.json`도 지워도 됩니다. 그다음 `/reload`를 입력하세요.
