# omo-statusbar

[English](README.md)

omo 푸터의 두 번째 줄에는 확장들이 올린 상태 항목이 키 순서로 정렬되어 나옵니다. 이 확장을 쓰면 그 순서를 직접 정하고, 보고 싶지 않은 항목은 숨길 수 있습니다. omo 푸터는 그대로 두고, 두 번째 줄의 상태 항목만 바꿉니다.

## 설치

```sh
omo install git:github.com/yjacket/omo-statusbar
```

omo가 저장소를 `<agentDir>/git/github.com/yjacket/omo-statusbar`에 클론하고 `<agentDir>/settings.json`의 `packages`에 등록합니다. 실행 중인 세션에서 `/reload`를 입력하세요.

업데이트는 `omo update --extensions`(git으로 설치한 확장 전부) 또는 `omo update --extension git:github.com/yjacket/omo-statusbar`(이 확장만)로 합니다. 실행 중인 세션은 `/reload`를 하거나 새 세션을 열면 반영됩니다.

예전 복사 스크립트로 설치했다면:

- `<agentDir>/extensions/status-arrange`를 지우세요. 남겨 두면 패키지와 함께 두 번 로드됩니다. `status-arrange.json`의 설정은 처음 시작할 때 `statusbar.json`으로 옮겨집니다.
- omo-tps-plus는 더 이상 쓰지 않습니다. 아직 설치돼 있으면 제거하고 `<agentDir>/extensions/tps.js`를 지우세요. 다음 시작 때 omo가 기본 tps 파일을 다시 씁니다. 그 캐시 상태는 이제 이 확장의 `omo-cache`입니다.

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

수명은 senpi의 모델별 TTL(`resolvePromptCacheTtlSeconds`)입니다. Claude 구독은 1시간, Anthropic API 키는 5분입니다. 답이 올 때마다 다시 시작합니다. 세션 시작, 리로드, 전환 때는 대화의 마지막 답부터 이어서 셉니다. senpi가 모델의 TTL을 모르면 숨겨집니다.

실행이 끝날 때마다 omo의 TPS 줄 바로 아래에 시간 줄이 나옵니다. 실행이 끝난 현지 시각과, 프롬프트부터 실행 끝까지 실제로 걸린 시간입니다(TPS 줄이 세는 스트리밍 시간만이 아닙니다):

```
TPS 61.2 tok/s. Cache hit 98.1%, 41.3s
⏱ 14:05:12 (3m 12s)
```

걸린 시간은 `12s`, `3m 12s`, `1h 05m`처럼 씁니다. 이 줄은 화면에만 나옵니다. 세션 파일에 저장되지 않고 모델도 보지 않습니다. omo는 알림 바로 아래에 온 알림으로 앞 알림을 바꿔 버리므로, 이 확장은 senpi의 tps 확장을 따로 한 벌 돌려(실행 중인 omo에서 불러오고 복사하지 않습니다) 그 TPS 문구를 다시 쓰고 아래에 시간 줄을 붙입니다. 그 모듈을 불러오지 못하면 시간 줄은 꺼지고 omo의 TPS 줄은 그대로 둡니다. 이때 경고가 한 번 나옵니다.

항목 사이 구분자는 omo가 아니라 이 확장이 넣습니다.

설정은 `<agentDir>/statusbar.json`에 저장됩니다:

```json
{
	"version": 1,
	"order": ["omo-cache", "  omo-native", "goal"],
	"hidden": ["omo-git"],
	"separator": "pipe",
	"gitIcon": "plain",
	"runTime": false
}
```

키는 앞 공백까지 확장이 정한 그대로 저장됩니다. 이 파일은 omo 런타임 밖에 있어서 omo나 omo-ai를 업데이트해도 남아 있습니다. `separator`나 `gitIcon`이 없으면 공백과 `±`를 씁니다. `"runTime": false`면 시간 줄을 끕니다. 없으면 켜져 있습니다.

## 제한

- 다른 확장이 `setFooter`로 자기 푸터를 설치하면, 시작할 때의 캡처 과정에서 그 푸터가 초기화될 수 있습니다.
- 대화형 TUI에서만 동작합니다.
- 시간 줄은 이 세션에서 시작한 실행에만 나옵니다. `/reload`할 때 이미 돌고 있던 실행에는 나오지 않습니다. TPS 줄과 실행 끝 사이에 다른 알림이 끼면 TPS 문구가 그 아래에 한 번 더 나옵니다.
- `omo-cache`는 시계만 봅니다. 세션이 쉬는 동안 keep-alive 요청으로 캐시가 갱신된 것이나, Claude 구독이 사용 한도를 넘어 5분 TTL로 떨어진 것은 알 수 없습니다.

## 개발

git worktree에서 새 브랜치로 작업하고 PR을 여세요. `master`에는 `test` 검사(`.github/workflows/test.yml`, windows-latest, `bun run test`)를 통과한 PR로만 변경이 들어갑니다. CI는 먼저 omo-ai를 설치합니다. `test/tps-compat.test.ts`가 설치된 senpi의 tps 확장을 불러오고, 그 경로나 알림 문구가 바뀌면 실패하기 때문입니다.

로컬 테스트는 Bun 1.4 이상에서 실행합니다:

```sh
bun test
```

`bun qa/run-qa.mjs`는 실제 omo 세션을 띄웁니다. `OMO_CODING_AGENT_DIR`가 없으면 실제 `~/.omo/agent`를 쓰므로, 실행 전에 `OMO_CODING_AGENT_DIR`(와 임시 `HOME`/`USERPROFILE`)를 임시 폴더로 지정하세요. 작업 트리를 omo에서 확인하려면 `omo install <클론 경로>`로 잠깐 확인하고, 끝나면 `omo install git:github.com/yjacket/omo-statusbar`로 다시 설치하세요.

## 제거

```sh
omo remove git:github.com/yjacket/omo-statusbar
```

`<agentDir>/statusbar.json`도 지워도 됩니다. 그다음 `/reload`를 입력하세요.
