import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { TERMS, CATS } from './data/terms.js'
import { buildWorld, updateLights, FLOOR_Y, FLOOR_ORDER, FLOOR_LABEL, SPAWNS, planToWorld } from './walk/buildWorld.js'
import { CollisionGrid } from './walk/Collision.js'
import { Controller, SPEED_PRESETS } from './walk/Controller.js'
import Hud from './walk/Hud.jsx'

export default function App() {
  const hostRef = useRef(null)
  const apiRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [locked, setLocked] = useState(false)
  const [floor, setFloor] = useState('f2')
  const [speedIdx, setSpeedIdx] = useState(1)
  const [aimed, setAimed] = useState(null)      // 조준된 용어 id
  const [openTerm, setOpenTerm] = useState(null)
  const [fps, setFps] = useState(0)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    /* ── 렌더러 ── */
    const canvas = document.createElement('canvas')
    canvas.className = 'gl'
    host.appendChild(canvas)
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.82
    renderer.setClearColor(0x0d1014, 1)

    const scene = new THREE.Scene()
    /* 안개 — 긴 복도 끝이 옅어지면서 깊이감과 넓이가 살아난다.
       이 한 줄이 "실내에 있다"는 인상에 가장 크게 기여한다 */
    scene.fog = new THREE.Fog(0xdfe4ea, 22, 130)
    scene.background = new THREE.Color(0xdfe4ea)

    const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 400)

    /* ── 월드 ── */
    const world = buildWorld(scene)
    const grid = new CollisionGrid(world.colliders)

    /* ── 컨트롤러 ── */
    const ctrl = new Controller(camera, canvas)
    ctrl.grid = grid
    ctrl.attach()
    ctrl.onLockChange = (v) => setLocked(v)

    let curFloor = 'f2'
    const spawn = (id) => {
      const s = SPAWNS.find((x) => x.id === id) || SPAWNS[0]
      const [wx, wz] = planToWorld(s.x, s.y)
      const fy = FLOOR_Y[s.floor]
      const [fx, fz] = grid.findFree(wx, wz, 0.32, fy + 1.85, fy + 0.28)
      curFloor = s.floor
      ctrl.floorY = fy
      ctrl.placeAt(fx, fz, fy, s.yaw)
      setFloor(s.floor)
      applyFloorVisibility(s.floor)
    }

    /* 다른 층은 통째로 끈다 — 성능과 시야 양쪽에 필요하다.
       단, 지금 층의 천장은 "위층 슬래브"다. 층으로만 거르면 천장이 함께
       사라져 하늘이 뚫린 것처럼 보이므로 위층 바닥판만 남긴다 */
    const applyFloorVisibility = (f) => {
      const above = FLOOR_ORDER[FLOOR_ORDER.indexOf(f) + 1]
      world.root.traverse((o) => {
        const d = o.userData
        if (!d) return
        if (d.hideAlways) { o.visible = false; return }
        const df = d.floor
        if (!df) return
        o.visible = df === f || (df === above && (d.slabMesh || d.floorTop))
      })
    }

    const changeFloor = (dir) => {
      const i = FLOOR_ORDER.indexOf(curFloor)
      const n = Math.max(0, Math.min(FLOOR_ORDER.length - 1, i + dir))
      if (n === i) return
      const f = FLOOR_ORDER[n]
      curFloor = f
      const fy = FLOOR_Y[f]
      const [fx, fz] = grid.findFree(ctrl.pos.x, ctrl.pos.z, 0.32, fy + 1.85, fy + 0.28)
      ctrl.floorY = fy
      ctrl.pos.set(fx, fy + 1.65, fz)
      ctrl.eyeCurrent = ctrl.eyeTarget = fy + 1.65
      setFloor(f)
      applyFloorVisibility(f)
      host.classList.add('flash')
      setTimeout(() => host.classList.remove('flash'), 320)
    }

    /* ── 조준 판정 ──
       화면 정중앙에서 레이를 쏘고, 처음 맞은 메시가 속한 용어를 집는다.
       그룹 중심으로 재면 안 된다 — 수배전 계통처럼 98 m를 가로지르는
       그룹은 코앞에 서 있어도 중심이 40 m 밖이라 전부 걸러진다.

       가운데 한 발만 쏘면 얇은 배관·계기를 조준하기가 신경질적으로
       어려워지므로 상하좌우로 조금 벌린 네 발을 함께 쏜다(관용 약 4°).
       벽·바닥이 먼저 맞으면 그 발은 거기서 끝 — 벽 너머는 잡히지 않는다. */
    const ray = new THREE.Raycaster()
    ray.far = 6.5
    const FAN = [[0, 0], [0.09, 0], [-0.09, 0], [0, 0.09], [0, -0.09]]
    const ndc = new THREE.Vector2()
    const hitBuf = []
    let aimId = null

    const chainVisible = (o) => {
      while (o) { if (!o.visible) return false; o = o.parent }
      return true
    }

    function pickAim() {
      let bestId = null, bestDist = Infinity
      for (let f = 0; f < FAN.length; f++) {
        ndc.set(FAN[f][0], FAN[f][1])
        ray.setFromCamera(ndc, camera)
        hitBuf.length = 0
        ray.intersectObjects(world.aimMeshes, false, hitBuf)
        for (let i = 0; i < hitBuf.length; i++) {
          const h = hitBuf[i]
          if (h.distance >= bestDist) break
          if (!chainVisible(h.object)) continue
          const id = h.object.userData.aimTerm
          if (id) { bestId = id; bestDist = h.distance }
          break
        }
      }
      return bestId
    }

    /* ── 상호작용 키 ── */
    ctrl.onKeyDown = (e) => {
      if (e.code === 'Space') {
        setOpenTerm((cur) => (cur ? null : aimId))
      } else if (e.code === 'Escape') {
        setOpenTerm(null)
      } else if (e.code === 'PageUp') {
        changeFloor(1)
      } else if (e.code === 'PageDown') {
        changeFloor(-1)
      } else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
        const n = Number(e.code.slice(5)) - 1
        setSpeedIdx(n)
        ctrl.walkSpeed = SPEED_PRESETS[n].walk
      }
    }

    /* ── 리사이즈 ── */
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    spawn('f2-hall')
    setReady(true)

    /* ── 루프 ── */
    let raf = 0
    let last = performance.now()
    let fpsAcc = 0, fpsN = 0, aimAcc = 0
    const animate = (now) => {
      raf = requestAnimationFrame(animate)
      const dt = (now - last) / 1000
      last = now

      ctrl.update(dt)
      updateLights(world.lights, camera.position, curFloor)

      /* 조준은 20 Hz면 충분하다 — 매 프레임 3천 개 메시에 레이를 쏠 이유가 없다 */
      aimAcc += dt
      if (aimAcc >= 0.05) {
        aimAcc = 0
        const id = pickAim()
        if (id !== aimId) { aimId = id; setAimed(id) }
      }

      renderer.render(scene, camera)

      fpsAcc += dt; fpsN++
      if (fpsAcc >= 0.5) { setFps(Math.round(fpsN / fpsAcc)); fpsAcc = 0; fpsN = 0 }
    }
    raf = requestAnimationFrame(animate)

    apiRef.current = {
      lock: () => ctrl.requestLock(),
      setSpeed: (i) => { ctrl.walkSpeed = SPEED_PRESETS[i].walk },
      setBob: (v) => { ctrl.headBob = v },
      goto: (id) => spawn(id),
      floorUp: () => changeFloor(1),
      floorDown: () => changeFloor(-1),
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      ctrl.detach()
      renderer.dispose()
      host.removeChild(canvas)
    }
  }, [])

  return (
    <div className="walk-root">
      <div className="viewport" ref={hostRef} />
      <Hud
        ready={ready}
        locked={locked}
        floor={floor}
        floorLabel={FLOOR_LABEL[floor]}
        speedIdx={speedIdx}
        fps={fps}
        aimed={aimed}
        aimedTerm={aimed ? TERMS[aimed] : null}
        openTerm={openTerm ? TERMS[openTerm] : null}
        cats={CATS}
        spawns={SPAWNS}
        onStart={() => apiRef.current && apiRef.current.lock()}
        onSpeed={(i) => { setSpeedIdx(i); apiRef.current && apiRef.current.setSpeed(i) }}
        onGoto={(id) => apiRef.current && apiRef.current.goto(id)}
        onClose={() => setOpenTerm(null)}
      />
    </div>
  )
}
