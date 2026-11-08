// 다국어: 한국어 문장을 키로 사용하고, 영어 번역을 사전에서 찾음
// t('최고 {n}', { n: 100 }) → ko: '최고 100' / en: 'Best 100'

let lang = 'ko';

const EN = {
  // 내비게이션 · 공통
  '플레이': 'Play', '벤치마크': 'Benchmark', '루틴': 'Routines', '만들기': 'Create', '기록': 'Stats', '설정': 'Settings',
  '감도': 'Sensitivity', '정확도': 'Accuracy', '타겟': 'Target', '구체': 'Orb', '풍선': 'Balloon', '시간': 'Time',
  '난이도': 'Difficulty', '쉬움': 'Easy', '보통': 'Normal', '어려움': 'Hard', '시나리오': 'Scenarios', '메뉴': 'Menu',
  '전체': 'All', '클릭': 'Clicking', '트래킹': 'Tracking', '타겟 전환': 'Switching', '반응': 'Reaction', '커스텀': 'Custom',
  '저장': 'Save', '취소': 'Cancel', '삭제': 'Delete', '수정': 'Edit', '이전': 'Back', '다음': 'Next', '완료': 'Done',
  '이름': 'Name', '종류': 'Type', '게임': 'Game', '언어': 'Language', '정보': 'About', '분야': 'Category', '티어': 'Tier',
  '점수': 'Score', '합계': 'Total', '단계': 'Step', '분석': 'Analysis', '자동': 'Auto', '미설정': 'Not set', '정지': 'Static',

  // 플레이 페이지
  '오늘도 한 판,': 'One more round,', '에임 워밍업': 'aim warm-up', '최근 10판 정확도': 'Accuracy · last 10',
  '연속 플레이': 'Day streak', '이 게임은 마우스가 있는 PC 브라우저(Chrome / Edge / Firefox)에서 플레이하세요.':
    'Play on a desktop browser with a mouse (Chrome / Edge / Firefox).',
  '최고 {n}': 'Best {n}', '기록 없음': 'No record', '총 {n}판 · 최근 7일 {w}판': '{n} runs · {w} this week', '{n}일': '{n}d',
  '오늘 플레이 완료 🔥': 'Played today 🔥', '오늘 플레이해서 기록을 이어가세요': 'Play today to keep your streak',
  '종합 랭크': 'Overall rank', '벤치마크 기준': 'from benchmark', '벤치마크로 측정하기': 'Measure with benchmark',
  '약점 맞춤 · {cat} · 약 {m}분': 'For your weakness · {cat} · ~{m} min', '추천 루틴 · 약 {m}분': 'Recommended · ~{m} min',
  '루틴 시작': 'Start routine', '10라운드': '10 rounds', '약 {m}분 · {n}단계': '~{m} min · {n} steps', '{n}초': '{n}s',
  '{fire} 사격 · ESC 일시정지 · R 재시작 · 기록은 이 브라우저에 저장됩니다': '{fire} to shoot · ESC pause · R restart · records are saved in this browser',
  '{fire} 사격 · ESC 일시정지 · R 즉시 재시작': '{fire} to shoot · ESC pause · R instant restart',
  '좌클릭': 'Left click',

  // 벤치마크
  '실력 측정,': 'Measure your skill,', '랭크 확인': 'see your rank',
  '8개 시나리오를 같은 조건(보통 · 45초 · 고정 배치)으로 플레이해 분야별 티어와 종합 랭크를 매깁니다.':
    'Play 8 scenarios under identical conditions (Normal · 45s · fixed layout) to get a tier per category and an overall rank.',
  '벤치마크 시작': 'Start benchmark', '최고 점수': 'Best score', '다음 티어까지': 'To next tier',
  '티어 기준은 점수 공식으로 추정한 임시 기준입니다. 실제 플레이 데이터가 쌓이면 보정될 수 있습니다.':
    'Tier thresholds are provisional estimates derived from the scoring formula and may be recalibrated with real play data.',
  '{d}/{n}개 시나리오 측정됨': '{d}/{n} scenarios measured', '벤치마크를 완료하면 랭크가 표시됩니다': 'Complete the benchmark to see your rank',
  '가장 약한 분야': 'Weakest category', '추천 루틴': 'Recommended routine', '추천 루틴 시작': 'Start recommended routine',
  '측정 후 약점에 맞는 루틴을 추천해 드려요': "After measuring, we'll recommend a routine for your weakness",
  '이것만': 'Only this', '벤치마크 · 보통 · 고정 배치': 'Benchmark · Normal · fixed layout',
  '아이언': 'Iron', '브론즈': 'Bronze', '실버': 'Silver', '골드': 'Gold', '플래티넘': 'Platinum', '다이아몬드': 'Diamond',
  '마스터': 'Master', '그랜드마스터': 'Grandmaster',

  // 루틴
  '루틴으로': 'Stay consistent', '꾸준하게': 'with routines',
  '여러 시나리오를 연속으로 진행하고, 마지막에 합계와 단계별 결과를 보여줍니다.': 'Play several scenarios back to back, then see totals and per-step results.',
  '인기 워밍업 5종': 'Popular 5-task warm-up',
  '에임 트레이너에서 가장 많이 추천되는 조합. 그리드 → 식스 → 센터 리턴 → 마이크로 → 스트레이프 트래킹.':
    'The most-recommended aim trainer combo. Grid → Six → Center return → Micro → Strafe tracking.',
  '랭크 전 3분 워밍업': '3-min pre-ranked warm-up',
  '발로란트 랭크 전 워밍업으로 자주 쓰이는 그리드 · 마이크로 · 스트레이프 트래킹 3종 압축판.':
    'A compact grid · micro · strafe tracking set often used before ranked matches.',
  '에임 베이직': 'Aim basics', '미세 조정과 플릭을 중심으로 한 기본기 루틴. 작은 동작에서 큰 동작, 원거리 정밀까지.':
    'Fundamentals focused on micro-adjustments and flicks, from small to large movements and long range.',
  '밸런스 벤치마크': 'Balanced set', '벤치마크식 3대 분류(클릭 · 트래킹 · 타겟 전환)를 골고루. 약점 파악용.':
    'Even coverage of clicking, tracking and switching. Good for finding weaknesses.',
  '트래킹 집중': 'Tracking focus', '부드러운 추적, 반응 추적, 추적 전환을 차례로. 트래킹이 약할 때 추천.':
    'Smooth, reactive and switching tracking in sequence. Recommended when tracking is your weakness.',
  '타겟 전환 집중': 'Switching focus', '여러 타겟 사이를 빠르게 옮겨 다니는 연습. 전환이 약할 때 추천.':
    'Practice moving quickly between targets. Recommended when switching is your weakness.',

  // 만들기
  '나만의': 'Your own', '타겟 수, 크기, 거리, 범위, 속도를 조절해 시나리오를 만들고 링크로 공유하세요.':
    'Tune target count, size, distance, spread and speed, then share it with a link.',
  '+ 새 시나리오': '+ New scenario', '클릭 (맞히면 처치)': 'Clicking (one hit kills)', '트래킹 (누르고 추적)': 'Tracking (hold to track)',
  '저장하고 플레이': 'Save & play', '아직 만든 시나리오가 없어요. "+ 새 시나리오"로 시작해 보세요.': 'No custom scenarios yet. Start with "+ New scenario".',
  '타겟 수': 'Targets', '타겟 크기': 'Target size', '거리 (m)': 'Distance (m)', '좌우 범위 (°)': 'Horizontal spread (°)',
  '상하 범위 (°)': 'Vertical spread (°)', '이동 속도 (°/초)': 'Move speed (°/s)', '타겟 수명 (초, 0=무제한)': 'Target lifetime (s, 0 = unlimited)',
  '처치까지 추적 시간 (초)': 'Tracking time to kill (s)', '플레이 시간 (초)': 'Duration (s)',
  '타겟 {n}개': '{n} targets', '크기 {n}': 'size {n}', '{n}m': '{n}m', '이동 {n}°/초': 'moving {n}°/s', '새 시나리오': 'New scenario',
  '저장했어요': 'Saved', '공유 링크': 'Share link', '공유 링크를 복사했어요': 'Share link copied',
  '"{name}" 시나리오를 삭제할까요?': 'Delete scenario "{name}"?', '공유 링크를 읽을 수 없어요': "Couldn't read the share link",
  '시나리오를 추가했어요': 'Scenario added', '내 시나리오에 추가': 'Add to my scenarios',

  // 기록
  '나의': 'Your', '주간 플레이 · 평균 정확도': 'Weekly runs · average accuracy', '최근 점수': 'Last score', '최근 정확도': 'Last accuracy',
  '추이': 'Trend', '이번 주': 'This week', '{n}주 전': '{n}w ago', '총 {n}판의 기록 (이 브라우저 기준)': '{n} runs recorded (this browser)',
  '아직 기록이 없어요. 시나리오를 한 판 플레이해 보세요!': 'No records yet. Play a scenario!',

  // 일시정지 · 결과
  '일시정지': 'Paused', '계속하기': 'Resume', '다시 시작': 'Restart', '메뉴로': 'Main menu', '최근 기록': 'Recent runs',
  '화면을 클릭하거나 계속하기를 누르세요': 'Click the screen or press Resume',
  '마우스 잠금에 실패했습니다. 잠시 후 다시 클릭하세요.': 'Mouse lock failed. Click again in a moment.',
  '명중 / 판정': 'Hits / ticks', '명중 / 발사': 'Hits / shots', '평균 처치 시간': 'Avg kill time', '처치 수': 'Kills',
  '최고 연속': 'Best streak', '놓친 타겟': 'Missed targets', '처치한 타겟': 'Targets killed', '평균 반응 속도': 'Avg reaction',
  '최고 반응 속도': 'Best reaction', '부정 출발': 'False starts', '첫 기록!': 'First record!', '이전 최고 {n}': 'Previous best {n}',
  '진행 중': 'in progress', '완료!': 'complete!', '다음: {name} ▶': 'Next: {name} ▶', '다음 단계': 'Next step',
  '루틴 다시 하기': 'Replay routine', '다시 하기': 'Play again', '기록이 쌓이면 추이가 표시됩니다': 'Your trend appears as you play more',
  '왼쪽': 'Left', '오른쪽': 'Right', '위쪽': 'Up', '아래쪽': 'Down',
  '방향별 평균 처치 시간': 'Avg kill time by direction', '플릭 거리별': 'By flick distance', '짧은 플릭 (<10°)': 'Short flicks (<10°)',
  '긴 플릭 (≥10°)': 'Long flicks (≥10°)', '언더플릭': 'Underflick', '오버플릭': 'Overflick', '구간별 추적 정확도 (5초 단위)': 'Tracking accuracy per 5s',
  '{dir} 방향 플릭이 가장 느려요 (가장 빠른 방향보다 {pct}% 느림). 이 방향을 집중적으로 연습해 보세요.':
    'Flicks to the {dir} are your slowest ({pct}% slower than your fastest direction). Practice that direction.',
  '빗나간 샷의 {pct}%가 타겟을 지나쳤어요 → 오버플릭 경향. 감도를 조금 낮추거나 멈추는 연습을 해보세요.':
    '{pct}% of misses went past the target → you tend to overflick. Try a slightly lower sensitivity or practice stopping.',
  '빗나간 샷의 {pct}%가 타겟에 못 미쳤어요 → 언더플릭 경향. 끝까지 따라가서 쏘는 연습을 해보세요.':
    '{pct}% of misses fell short → you tend to underflick. Practice following through before shooting.',
  '후반으로 갈수록 정확도가 {pct}%p 떨어졌어요. 집중력과 손목 피로를 관리해 보세요.':
    'Accuracy dropped {pct} points toward the end. Watch focus and wrist fatigue.',
  '후반에 정확도가 {pct}%p 올라갔어요. 플레이 전 워밍업을 조금 더 하면 좋아요.':
    'Accuracy rose {pct} points later in the run. A bit more warm-up before playing would help.',

  // HUD · 게임 중
  '처치': 'Kills', '놓침': 'Missed', '콤보 끊김': 'COMBO BREAK', '라운드': 'Round', '남은 시간': 'Time left', '연속': 'Streak',
  '기다리세요…': 'Wait…', '너무 빨라요! −100': 'Too early! −100',

  // 첫 실행
  '브라우저에서 바로 하는 FPS 에임 트레이너. 1분이면 준비 끝!': 'An FPS aim trainer right in your browser. Ready in a minute!',
  '평소 감도를 알려주세요': 'What sensitivity do you use?',
  '주로 하는 게임의 감도를 넣으면 똑같은 회전량으로 맞춰집니다.': 'Enter your main game’s sensitivity and we’ll match its exact turn rate.',
  '인게임 감도': 'In-game sensitivity', '마우스 DPI': 'Mouse DPI', 'DPI를 모르겠어요 → 측정하기': "Don't know your DPI? → Measure it",
  '준비 완료!': "You're all set!", '벤치마크로 지금 실력을 측정하면 분야별 티어와 약점에 맞는 루틴을 추천해 드려요.':
    'Take the benchmark to get a tier per category and a routine tailored to your weaknesses.',
  '벤치마크로 실력 측정': 'Measure with the benchmark', '약 6분 · 8개 시나리오': '~6 min · 8 scenarios', '바로 둘러보기': 'Look around first',
  '나중에 언제든 할 수 있어요': 'You can do it any time', '360° 회전에 필요한 마우스 이동 거리': 'Mouse travel for a 360° turn',

  // 진단
  '입력 진단 · DPI 측정': 'Input diagnostics · DPI measurement',
  '아래 영역을 클릭하면 마우스가 잠기고 측정이 시작됩니다. ESC로 해제.': 'Click the area below to lock the mouse and start measuring. ESC to release.',
  '마우스 이벤트': 'Mouse events', '화면 주사율': 'Frame rate', '가로 이동량': 'Horizontal counts', '입력 방식': 'Input mode',
  '움직인 실제 거리 (cm)': 'Actual distance moved (cm)', '이동량 초기화': 'Reset counts', '측정한 DPI 적용': 'Apply measured DPI',
  'DPI 측정: 자를 대고 이동량을 초기화한 뒤, 마우스를 정확히 위 거리만큼 오른쪽으로 천천히 움직이세요.':
    'To measure DPI: place a ruler, reset the counts, then slowly move the mouse right by exactly the distance above.',
  'Raw 입력 (가속 무시)': 'Raw input (no acceleration)', '일반 입력 (OS 가속 영향)': 'Standard input (OS acceleration applies)',
  '영역을 클릭하세요': 'Click the area', '측정값': 'measured', 'DPI를 {n}으로 설정했어요': 'DPI set to {n}',

  // 설정
  '배경 · 화면': 'Visuals', '크로스헤어': 'Crosshair', '조작 · 사운드': 'Controls · Sound', '일반 · 정보': 'General · About',
  '사용할 게임': 'Game profile', '감도는 게임마다 따로 저장됩니다. 정확한 변환을 위해 OS의 "포인터 정밀도 향상"은 꺼두세요.':
    'Sensitivity is saved per game. For accurate conversion, turn off "Enhance pointer precision" in your OS.',
  '게임별 감도': 'Sensitivity per game',
  '저장된 감도와, 지금 감도와 같은 회전량(cm/360)이 되는 환산값. 행을 누르면 그 게임으로 전환합니다.':
    'Saved values and the equivalent of your current turn rate (cm/360). Click a row to switch to that game.',
  '저장된 감도': 'Saved', '같은 감도': 'Equivalent', '환산값 저장': 'Save equivalent', '{game} 감도': '{game} sensitivity',
  '✓ {game} 시야각 적용됨 ({fov}°)': '✓ {game} FOV applied ({fov}°)', '{game} 시야각 적용 ({fov}°)': 'Apply {game} FOV ({fov}°)',
  '배경 테마': 'Background theme', '수평 시야각 (FOV)': 'Horizontal FOV', 'FPS 표시': 'Show FPS', '그래픽 품질': 'Graphics quality',
  '높음 · 네온 글로우(블룸) + 그림자': 'High · neon glow (bloom) + shadows', '낮음 · 가볍게 (저사양 PC)': 'Low · lightweight (low-end PCs)',
  '클릭 모드 타겟': 'Clicking targets', '트래킹 모드 타겟': 'Tracking targets',
  '사람 표적은 트래킹 모드에서만 나오며, 처치하면 터지지 않고 조용히 사라집니다.': 'Human targets only appear in tracking modes and fade out quietly when depleted.',
  '타겟 색상': 'Target color', '사람 표적': 'Human target', '움직이는 사람 형태': 'Moving human figure', '클릭 타겟과 동일': 'Same as clicking',
  '{kind} 사용': 'Uses {kind}', '색상': 'Color', '길이': 'Length', '두께': 'Thickness', '간격': 'Gap', '중앙 점': 'Center dot', '외곽선': 'Outline',
  '발사': 'Fire', '마우스 왼쪽 클릭은 항상 발사됩니다. 추가 발사 키(키보드 키 또는 마우스 버튼)를 하나 지정할 수 있어요.':
    'Left click always fires. You can bind one extra fire input (a key or mouse button).',
  '지우기': 'Clear', '효과음 볼륨': 'Sound volume', '키나 마우스 버튼을 누르세요… (Esc 취소)': 'Press a key or mouse button… (Esc to cancel)',
  '+ 추가 발사 키 지정': '+ Bind extra fire key', 'R은 재시작 키라서 쓸 수 없어요': "R is the restart key and can't be used",
  '휠 클릭': 'Middle click', '우클릭': 'Right click', '마우스 4 (뒤로)': 'Mouse 4 (back)', '마우스 5 (앞으로)': 'Mouse 5 (forward)',
  '색약 모드': 'Color vision mode', '끄기': 'Off', '적록색약 (녹색약)': 'Deuteranopia', '적록색약 (적색약)': 'Protanopia', '청황색약': 'Tritanopia',
  '첫 실행 안내 다시 보기': 'Show welcome guide again',
  '모든 기록과 설정은 이 브라우저에만 저장되며 서버로 전송되지 않습니다.': 'All records and settings stay in this browser and are never sent to a server.',
  '게임 이름(Valorant, Counter-Strike 2 등)은 감도 변환을 설명하기 위해서만 사용되며, 각 상표권자와 무관합니다.':
    'Game names (Valorant, Counter-Strike 2, etc.) are used only to describe sensitivity conversion. This project is not affiliated with their trademark owners.',
  '오류 기록 복사': 'Copy error log', '기록 내보내기 (JSON)': 'Export data (JSON)', '기록 초기화': 'Reset records',
  '저장된 오류 기록: {n}건': 'Stored errors: {n}', '복사했어요': 'Copied', '모든 최고 기록과 히스토리를 삭제할까요?': 'Delete all best scores and history?',
  '오류가 발생했어요. 설정 → 일반에서 오류 기록을 복사할 수 있어요.': 'Something went wrong. You can copy the error log in Settings → General.',

  // 데이터 라벨 (시나리오 · 테마 · 게임 등)
  '그리드 클릭': 'Grid Click', '플릭 · 속도': 'Flick · Speed',
  '격자 위 3개의 타겟. 하나를 맞히면 다른 칸에 새로 생깁니다. 연속 명중 보너스.': 'Three targets on a grid. Hit one and another appears in a different cell. Streak bonus.',
  '식스 타겟': 'Six Targets', '정적 클릭': 'Static clicking', '작은 타겟 6개가 동시에. 정확하게 하나씩, 효율적인 순서로 처리하세요.':
    'Six small targets at once. Clear them precisely, in an efficient order.',
  '센터 리턴 플릭': 'Center Return Flick', '플릭': 'Flicking', '중앙 타겟과 바깥 타겟이 번갈아 나옵니다. 크게 플릭하고 다시 중앙으로.':
    'Targets alternate between the center and the outside. Flick out, then back to center.',
  '마이크로 플릭': 'Micro Flick', '미세 조정': 'Micro-adjust', '작은 타겟이 직전 위치 근처에 생깁니다. 손목의 미세 조정 연습.':
    'Small targets appear near the previous one. Trains fine wrist adjustments.',
  '와이드 플릭': 'Wide Flick', '넓은 범위에 하나씩 나타나는 타겟을 빠르게 플릭. 빠를수록 보너스.': 'One target at a time across a wide area. Faster kills earn a bonus.',
  '무빙 클릭': 'Moving Click', '동적 클릭': 'Dynamic clicking', '움직이는 타겟 3개를 클릭으로 처리하세요. 움직임을 읽고 쏘는 연습.':
    'Click three moving targets. Practice reading movement before you shoot.',
  '스트레이프 트래킹': 'Strafe Tracking', '반응 트래킹': 'Reactive tracking',
  '좌우 AD 무빙하고 가끔 멈추거나 점프하는 타겟을 꾹 눌러 추적하세요.': 'Hold fire and track a target that strafes left and right, sometimes stopping or jumping.',
  '스무스 트래킹': 'Smooth Tracking', '정밀 트래킹': 'Precise tracking',
  '꾹 누른 채 부드럽게 움직이는 타겟을 따라가세요. 체력이 다 닳으면 처치.': 'Hold fire and follow a smoothly moving target until its health runs out.',
  '타겟 스위칭': 'Target Switching', '추적 + 전환': 'Track + switch',
  '움직이는 타겟 3개. 하나를 추적해서 처치하면 바로 다음 타겟으로 전환.': 'Three moving targets. Track one down, then switch to the next.',
  '라이징 타겟': 'Rising Targets', '빠른 전환': 'Fast switching',
  '바닥에서 떠오르는 타겟들을 천장에 닿기 전에 처리하세요. 점점 빨라집니다.': 'Clear targets rising from the floor before they reach the ceiling. They speed up over time.',
  '정밀 사격': 'Precision', '원거리 정밀': 'Long-range precision',
  '멀리 있는 타겟이 점점 작아지다 사라집니다. 사라지기 전에 정확하게.': 'Distant targets shrink and vanish. Hit them precisely before they disappear.',
  '반응속도': 'Reaction', '타겟이 나타나는 순간 바로 쏘세요. 10라운드. 미리 쏘면 감점!': 'Shoot the moment the target appears. 10 rounds. Shooting early costs points!',
  'Call of Duty (MW / 워존)': 'Call of Duty (MW / Warzone)', 'Fortnite (X 감도 %)': 'Fortnite (X sensitivity %)',
  'Rainbow Six Siege (배율 0.02)': 'Rainbow Six Siege (multiplier 0.02)', 'cm/360 직접 입력': 'Enter cm/360 directly',
  '트래킹 모드 전용 · 움직이는 사람 표적': 'Tracking modes only · moving human target', '빛나는 공 타겟': 'Glowing ball target',
  '알록달록 풍선': 'Colorful balloons', '미드나잇 그리드': 'Midnight Grid', '라이트 랩': 'Light Lab', '신스웨이브': 'Synthwave',
  '보이드 (미니멀)': 'Void (minimal)', '스카이 아레나': 'Sky Arena',
};

const DICTS = { en: EN };

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'ko';
}

export function getLang() {
  return lang;
}

export function hasTranslation(key, l = 'en') {
  return Object.prototype.hasOwnProperty.call(DICTS[l] || {}, key);
}

export function t(key, vars) {
  let s = (lang !== 'ko' && DICTS[lang]?.[key]) || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** data-i18n 요소의 원문(한국어)을 기억해 두고 현재 언어로 바꿈 */
export function applyI18n(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    if (el.dataset.i18nSrc === undefined) el.dataset.i18nSrc = el.textContent.trim().replace(/\s+/g, ' ');
    el.textContent = t(el.dataset.i18nSrc);
  }
}
