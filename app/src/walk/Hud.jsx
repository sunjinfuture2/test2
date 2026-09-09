import { SPEED_PRESETS } from './Controller.js'

/**
 * 워크스루 HUD — 최소주의.
 *
 * 체력바·나침반·좌표 같은 게임 요소는 넣지 않는다. 화면에 남는 것은
 * 지금 몇 층인지, 무엇을 보고 있는지, 어떻게 움직이는지 셋뿐이다.
 */
export default function Hud({
  ready, locked, floorLabel, speedIdx, fps,
  aimed, aimedTerm, openTerm, cats, spawns,
  onStart, onSpeed, onGoto, onClose,
}) {
  return (
    <div className="hud">
      {/* 시작 오버레이 — 포인터 락은 사용자 제스처에서만 걸 수 있다 */}
      {ready && !locked && (
        <div className="gate">
          <div className="gate-card">
            <div className="gate-title">AI 데이터센터 내부 둘러보기</div>
            <div className="gate-sub">충주 데이터센터 · 실측 도면 기반</div>

            <button className="gate-go" onClick={onStart}>화면을 클릭해 시작</button>

            <div className="gate-keys">
              <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>이동</span></div>
              <div><kbd>마우스</kbd><span>둘러보기</span></div>
              <div><kbd>Shift</kbd><span>달리기</span></div>
              <div><kbd>Space</kbd><span>장비 설명</span></div>
              <div><kbd>PgUp</kbd><kbd>PgDn</kbd><span>층 이동</span></div>
              <div><kbd>Esc</kbd><span>마우스 풀기</span></div>
            </div>

            <div className="gate-spawn">
              <span className="gate-spawn-label">시작 위치</span>
              {spawns.map((s) => (
                <button key={s.id} onClick={() => onGoto(s.id)}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 상단 바 */}
      <div className="top">
        <span className="floor">{floorLabel}</span>
        <span className="sep" />
        <span className="speed">
          {SPEED_PRESETS.map((p, i) => (
            <button
              key={p.id}
              className={i === speedIdx ? 'on' : ''}
              onClick={() => onSpeed(i)}
              title={`${p.walk} m/s`}
            >
              {p.label}
            </button>
          ))}
        </span>
        <span className="fps">{fps} fps</span>
      </div>

      {/* 조준 힌트 — 크로스헤어는 그리지 않는다 (게임 느낌의 가장 큰 원인) */}
      {locked && aimed && !openTerm && (
        <div className="aim" style={{ '--cat': cats[aimedTerm.cat].color }}>
          <div className="aim-name">{aimedTerm.name}</div>
          <div className="aim-key"><kbd>Space</kbd> 설명 보기</div>
        </div>
      )}

      {/* 설명 패널 */}
      {openTerm && (
        <div className="panel" style={{ '--cat': cats[openTerm.cat].color }}>
          <button className="panel-x" onClick={onClose} aria-label="닫기">×</button>
          <div className="panel-head">
            <div className="panel-name">{openTerm.name}</div>
            <div className="panel-en">{openTerm.en}</div>
          </div>
          <p className="panel-desc">{openTerm.desc}</p>
          <ul className="panel-facts">
            {openTerm.facts.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
