import { Suspense, useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Center, Bounds } from '@react-three/drei'
import { FBXLoader, EXRLoader } from 'three-stdlib'
import gsap from 'gsap'
import * as THREE from 'three'

const MODEL_URL = encodeURI('/models/SHARPIE PEN.fbx')
const TEXTURE_URL = '/models/textures/sharpie-texture-bold.png'
const HDRI_URL = encodeURI('/cayley_interior_2k.exr')

// The holder's actual resting base in world space, read directly off the cup
// mesh's bounding box after Bounds/Center place the model (verified: a test
// plane dropped at this exact position lined up with the cup's visible base).
// The cup itself never moves — only the pens rise/fall — so a shadow anchored
// here is correctly "under the bottle" for the model's entire lifetime.
// Nudged slightly further down (more negative) than that measured base, for
// a touch more breathing room between the cup and the shadow.
const SHADOW_Y = -2.85
const SHADOW_DIAMETER = 4.5

// Reflections only, subtle: high envMapIntensity on a Canvas rendered with
// `flat` (no tone mapping, see below) blows out highlights and washes the
// pens' colors out fast. This value was picked by eye to add visible IBL
// sheen without doing that. Paired with MATERIAL_ROUGHNESS below — intensity
// controls how *visible* the reflection is, roughness controls how *sharp*
// it is; both were nudged together for a crisper-but-still-plastic look
// without touching the scene lights' own intensity.
const ENV_MAP_INTENSITY = 0.75

// Lower roughness = tighter, more defined specular highlights and a clearer
// (less blurred) HDRI reflection — 0.6 read as soft/matte; 0.4 is still
// solidly in glossy-plastic territory (mirror-like would need <0.15).
// metalness is untouched (0.15): this is what keeps reflections tinted by
// the surface color instead of the metallic/mirror-like white-highlight look.
const MATERIAL_ROUGHNESS = 0.4

// The FBX's pen parts are mostly flat siblings under the holder mesh (Cylinder001),
// not grouped per-pen — only one pen's cap+tip are already nested under its body.
// Everything else is a loose sibling positioned to visually line up with a body.
const BODY_NAMES = new Set(['cuerpo_sharpie1', 'cuerpo_sharpie002'])
const EXCLUDED_NAMES = new Set(['PenSenseV2_191120_Enclosure_STEP'])

// Green and orange, by request: widen the label text a little (both sides,
// symmetric about center) while leaving its height/thickness/placement alone.
// repeat.x controls the label's reading-direction extent post-rotation; repeat.y
// (left untouched at 1) is the perpendicular one — confirmed empirically, since
// which axis maps to which visual direction isn't obvious once the -90° label
// rotation is factored in. <1 enlarges that axis, so 0.9 is a ~11% subtle widen.
const WIDENED_PEN_INDICES = new Set([1, 5])
const WIDEN_REPEAT_X = 0.9

// Pen index -> color key, matching buildPenGroups' output order (confirmed
// via each body's sibling cap material color, same mapping used above for
// WIDENED_PEN_INDICES: 1 is green, 5 is orange).
const PEN_COLOR_KEYS = ['red', 'green', 'yellow', 'black', 'blue', 'orange']

// This asset is authored Z-up (3ds Max convention) and Cylinder001 carries a
// corrective rotation so it *displays* correctly — but that means local +Y is
// NOT world-up for anything parented under it; local +Z is. Verified empirically:
// transforming local axes through Cylinder001's world quaternion, +Z is the only
// one that lands on world +Y. All motion below moves along local +Z only — pure
// vertical, no horizontal drift, no tilt.
//
// How far a pen rises is measured from its own body mesh, not a fixed number:
// each pen lifts by a fraction of its own real (world-space) body length, so the
// label panel clears the holder's rim regardless of any per-pen size variation.
const REVEAL_FRACTION = 0.55
const RISE_DURATION = 0.45
const RETURN_DURATION = 0.4

// Groups loose body/cap/tip meshes into one THREE.Group per pen (by nearest
// horizontal position to each body), preserving world transforms via
// Object3D.attach so nothing visually shifts. Also records each pen's resting
// local transform and its own measured rise distance, so animations always have
// an exact home to return to and a rise sized to that specific pen's geometry.
function buildPenGroups(fbx) {
  if (fbx.userData.penGroups) return fbx.userData.penGroups

  const cylinder = fbx.getObjectByName('Cylinder001')
  const candidates = cylinder.children.slice().filter((c) => !EXCLUDED_NAMES.has(c.name))
  const bodies = candidates.filter((c) => BODY_NAMES.has(c.name))
  const loose = candidates.filter((c) => !BODY_NAMES.has(c.name))

  // How much world-space distance one unit of local +Z (this hierarchy's "up")
  // covers, given Cylinder001's own rotation/scale — lets us convert a measured
  // real-world rise distance into the right local position delta.
  cylinder.updateWorldMatrix(true, false)
  const originWorld = new THREE.Vector3(0, 0, 0).applyMatrix4(cylinder.matrixWorld)
  const upWorld = new THREE.Vector3(0, 0, 1).applyMatrix4(cylinder.matrixWorld)
  const worldUnitsPerLocalZ = originWorld.distanceTo(upWorld)

  const tmp = new THREE.Vector3()
  const penGroups = bodies.map((body) => {
    const group = new THREE.Group()
    cylinder.add(group)
    // Position the group at the body's own transform *before* attaching, so the
    // group itself carries the pen's spatial offset — attach() then folds the
    // body in with a near-zero local offset, since its world transform is
    // unchanged.
    group.position.copy(body.position)
    group.quaternion.copy(body.quaternion)
    group.attach(body)

    // Measure this specific pen's body length in world space, then convert the
    // desired reveal distance back into a local +Z delta.
    const bodyWorldBox = new THREE.Box3().setFromObject(body)
    const bodyWorldHeight = bodyWorldBox.max.y - bodyWorldBox.min.y
    const riseDistance = (bodyWorldHeight * REVEAL_FRACTION) / worldUnitsPerLocalZ

    return { group, bodyWorldPos: body.getWorldPosition(new THREE.Vector3()), riseDistance }
  })

  // One body mesh (the red pen) measures noticeably taller than the rest —
  // an inconsistency in the source FBX geometry, not a deliberate size
  // difference — which made its riseDistance (proportional to its own
  // measured height, see above) send it visibly higher than the other five
  // when raised. Normalize outliers back to the group's typical (median)
  // rise distance so every pen tops out level; the other five are already
  // within ~1% of each other and stay untouched by this.
  const sortedRises = penGroups.map((pg) => pg.riseDistance).sort((a, b) => a - b)
  const medianRise = sortedRises[Math.floor(sortedRises.length / 2)]
  penGroups.forEach((pg) => {
    if (Math.abs(pg.riseDistance - medianRise) / medianRise > 0.08) {
      pg.riseDistance = medianRise
    }
  })

  loose.forEach((item) => {
    const itemPos = item.getWorldPosition(tmp.clone())
    let nearestIdx = 0
    let nearestDist = Infinity
    penGroups.forEach((pg, i) => {
      const d = Math.hypot(pg.bodyWorldPos.x - itemPos.x, pg.bodyWorldPos.z - itemPos.z)
      if (d < nearestDist) {
        nearestDist = d
        nearestIdx = i
      }
    })
    penGroups[nearestIdx].group.attach(item)
  })

  const groups = penGroups.map(({ group, riseDistance }, i) => {
    group.userData.penIndex = i
    group.traverse((o) => { o.userData.penIndex = i })

    group.userData.home = {
      position: group.position.clone(),
      riseDistance,
    }
    return group
  })

  fbx.userData.penGroups = groups
  return groups
}

function playExit(group, onComplete) {
  const { position: home, riseDistance } = group.userData.home
  gsap.killTweensOf(group.position)

  // Straight up (local +Z) only — stays inside the holder, no horizontal drift,
  // no tilt. Stops once the label panel has cleared the rim.
  return gsap.to(group.position, {
    z: home.z + riseDistance,
    duration: RISE_DURATION,
    ease: 'power2.out',
    onComplete,
  })
}

function playReturn(group, onComplete) {
  const { position: home } = group.userData.home
  gsap.killTweensOf(group.position)

  // Straight back down (local -Z) into its exact resting slot.
  return gsap.to(group.position, {
    z: home.z,
    duration: RETURN_DURATION,
    ease: 'power2.inOut',
    onComplete: () => {
      // `home` is already the position Vector3 (destructured above), not a
      // wrapper object — copy from `home` directly, not `home.position`
      // (that was `undefined`, and Vector3.copy(undefined) threw, which
      // silently aborted this callback *before* reaching onComplete() below.
      // That left isAnimating stuck at true forever, so every click after a
      // pen's first return was swallowed with nothing to unstick it — the
      // exact bug reported: rise works, fall works, but a second rise never
      // fires again.
      group.position.copy(home)
      onComplete()
    },
  })
}

function SharpiePenModel({ onPenToggle, onLoadProgress, ...props }) {
  // Byte-level progress for the FBX specifically (not three.js's built-in
  // LoadingManager, which only counts *files* loaded out of files total —
  // with one 130MB+ model next to a handful of small textures, that would
  // sit at 0% for nearly the entire wait and then jump straight to 100%,
  // not something a percentage bar can meaningfully show).
  const fbx = useLoader(FBXLoader, MODEL_URL, undefined, (event) => {
    if (event.lengthComputable) onLoadProgress?.(event.loaded, event.total)
  })
  const labelTexture = useLoader(THREE.TextureLoader, TEXTURE_URL)
  labelTexture.colorSpace = THREE.SRGBColorSpace
  // Source artwork reads top-to-bottom along the pen's length; rotate 90°
  // about the texture's center so the label instead wraps horizontally
  // around the barrel.
  labelTexture.center.set(0.5, 0.5)
  labelTexture.rotation = -Math.PI / 2

  const penGroups = buildPenGroups(fbx)

  // Same texture, same rotation/placement — repeat.x alone pulled in slightly
  // so the label reads a little wider, symmetric about its own center.
  const labelTextureWidened = useMemo(() => {
    const t = labelTexture.clone()
    t.needsUpdate = true
    t.center.set(0.5, 0.5)
    t.rotation = -Math.PI / 2
    t.repeat.set(WIDEN_REPEAT_X, 1)
    return t
  }, [labelTexture])

  fbx.traverse((child) => {
    if (!child.isMesh) return
    // MeshPhongMaterial ignores the scene's environment lighting; swap to
    // MeshStandardMaterial for consistent PBR shading under the lights below.
    // DoubleSide by default: the pen holder is an open-topped cup, and with the
    // default FrontSide its inner wall (facing inward) gets culled, showing
    // through to the page background instead of the holder's own black color.
    //
    // Verified against the FBX's raw Diffuse values directly (e.g. pure (1,0,0)
    // red, pure (0,0,1) blue): these are gamma-invariant endpoints, so sRGB vs.
    // linear interpretation isn't the issue — FBXLoader's color parsing is fine
    // as-is. The dullness is a lighting/exposure problem (see the Canvas lights
    // below), not a color-space one.
    const toStandard = (mat) =>
      new THREE.MeshStandardMaterial({
        name: mat.name,
        color: mat.color,
        roughness: MATERIAL_ROUGHNESS,
        metalness: 0.15,
        side: THREE.DoubleSide,
        envMapIntensity: ENV_MAP_INTENSITY,
      })

    const mats = Array.isArray(child.material)
      ? child.material.map(toStandard)
      : [toStandard(child.material)]

    // Parsed from the FBX's binary Connections graph: the only material with an
    // image texture in this file is "cuerpo sharpie:1 #3" (the pen body), which
    // carries the embedded label artwork (extracted from an embedded PSD).
    mats.forEach((mat) => {
      if (mat.name === 'cuerpo sharpie:1 #3') {
        mat.color.set(0xffffff)
        mat.map = WIDENED_PEN_INDICES.has(child.userData.penIndex) ? labelTextureWidened : labelTexture
        mat.needsUpdate = true
      }
    })

    child.material = Array.isArray(child.material) ? mats : mats[0]
  })

  // Per-pen state machine: idle-inside <-> animating <-> idle-out (partially).
  // Independent per pen. A click that arrives while the pen is mid-animation
  // isn't dropped — it's queued and fires the moment the current animation
  // ends, so every click still toggles the pen exactly once.
  const penState = useRef(penGroups.map(() => ({ isOut: false, isAnimating: false, queued: false, queuedSilent: false })))
  // Which pen is currently up (or on its way up) — only ever one, or none.
  // Set/cleared exclusively from handleClick below, never from an animation's
  // own completion callback: a superseded pen's completion can fire well
  // after a newer click has already moved this on to a different pen, so
  // letting it touch this ref risked stomping the newer selection.
  const activePenIndexRef = useRef(null)

  const runToggle = (penIndex, { silent = false } = {}) => {
    const state = penState.current[penIndex]
    const group = penGroups[penIndex]
    state.isAnimating = true
    // Fire on pick-up/put-down, not on rise-animation completion — reads as
    // an immediate reaction to the click rather than a laggy afterthought.
    // Silenced for a pen being auto-returned because a different one was
    // picked up — that click already reports the new active color, and a
    // stray "false" landing afterward would incorrectly blank it out.
    if (!silent) {
      onPenToggle?.(PEN_COLOR_KEYS[penIndex], !state.isOut)
    }
    const onComplete = () => {
      state.isAnimating = false
      state.isOut = !state.isOut
      if (state.queued) {
        const wasSilent = state.queuedSilent
        state.queued = false
        state.queuedSilent = false
        runToggle(penIndex, { silent: wasSilent })
      }
    }
    if (state.isOut) {
      playReturn(group, onComplete)
    } else {
      playExit(group, onComplete)
    }
  }

  const handlePenClick = (penIndex) => {
    // Only one pen up at a time: picking up a different pen sends whichever
    // one is currently active back down first (or flags it to return the
    // moment its own in-flight rise finishes), same as clicking it directly
    // would — it just happens automatically here instead of needing a
    // separate click.
    const prevActive = activePenIndexRef.current
    if (prevActive !== null && prevActive !== penIndex) {
      const prevState = penState.current[prevActive]
      if (prevState.isAnimating) {
        if (!prevState.isOut) {
          prevState.queued = true
          prevState.queuedSilent = true
        }
        // Already mid-return (isOut still true until its own completion) —
        // leave it alone, it's already headed down on its own.
      } else if (prevState.isOut) {
        runToggle(prevActive, { silent: true })
      }
    }

    const state = penState.current[penIndex]
    if (state.isAnimating) {
      state.queued = true
      return
    }

    // This click always decides the new active pen: raising this one makes
    // it active; clicking the already-active one down clears active entirely.
    activePenIndexRef.current = state.isOut ? null : penIndex
    runToggle(penIndex)
  }

  const handleClick = (event) => {
    event.stopPropagation()
    let obj = event.object
    let penIndex
    while (obj) {
      if (obj.userData?.penIndex !== undefined) {
        penIndex = obj.userData.penIndex
        break
      }
      obj = obj.parent
    }
    if (penIndex === undefined) return
    handlePenClick(penIndex)
  }

  return <primitive object={fbx} onClick={handleClick} {...props} />
}

function Loader() {
  return (
    <mesh>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial color="#7c5cff" wireframe />
    </mesh>
  )
}

// drei's <ContactShadows> (a per-frame depth-capture render) produced nothing
// visible in this scene despite correct positioning and no console errors —
// swapped for a plain radial-gradient "blob" shadow instead: a soft
// black-to-transparent circle baked once into a canvas texture. Much less
// capable (it can't pick up cast shapes), but for a single static object
// sitting on flat ground it reads the same, and it can't silently fail the
// way a multi-pass render-to-texture effect can.
function ShadowBlob() {
  const texture = useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    // The cup's own footprint covers roughly the inner 64% of this plane's
    // radius (measured: cup radius ~1.45 against SHADOW_DIAMETER/2 = 2.25) —
    // so anything drawn in that inner region is sitting directly under opaque
    // geometry and can never actually be seen. Held flat at peak darkness out
    // to that hidden radius (wasting contrast there is fine, it's invisible),
    // then eased outward with a curve (not a few straight-line segments) so
    // the visible ring fades the way a soft real-world contact shadow does:
    // holds close to its darkest just past the contact point, then tapers
    // off with a long, gradually thinning tail instead of a stepped falloff.
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    const peakAlpha = 0.38
    const hiddenRadius = 0.62
    gradient.addColorStop(0, `rgba(0,0,0,${peakAlpha})`)
    gradient.addColorStop(hiddenRadius, `rgba(0,0,0,${peakAlpha})`)
    const falloffSteps = 14
    for (let i = 1; i <= falloffSteps; i++) {
      const u = i / falloffSteps
      const t = hiddenRadius + u * (1 - hiddenRadius)
      const alpha = peakAlpha * Math.pow(1 - u, 1.6)
      gradient.addColorStop(t, `rgba(0,0,0,${alpha.toFixed(3)})`)
    }
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    // The plane is seen at a near edge-on angle (OrbitControls' vertical
    // range is deliberately tight), so on screen it compresses to just a
    // handful of pixels tall. With mipmapping on, the GPU was averaging the
    // dark center texel together with this texture's fully-transparent
    // corners for every sampled pixel — measured effective opacity came out
    // ~9x lower than authored. Forcing full-resolution sampling (no mipmaps)
    // fixes that; the plane is simple/flat enough that this costs nothing.
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [])

  return (
    <mesh position={[0, SHADOW_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[SHADOW_DIAMETER, SHADOW_DIAMETER]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

// Lighting-only HDRI: loads the EXR as an equirect, runs it through
// PMREMGenerator by hand (same prefiltering drei's <Environment> does under
// the hood, just inline so this stays one scene with explicit control), and
// assigns the result to scene.environment only. scene.background is never
// touched, so the page's existing backdrop shows through unchanged — the EXR
// contributes reflections/IBL lighting, not a visible skybox.
function HDRIEnvironment({ url, onReady }) {
  const { gl, scene } = useThree()
  const hdriTexture = useLoader(EXRLoader, url)
  const readyFrames = useRef(0)
  const firedReady = useRef(false)

  useEffect(() => {
    hdriTexture.mapping = THREE.EquirectangularReflectionMapping

    const pmremGenerator = new THREE.PMREMGenerator(gl)
    pmremGenerator.compileEquirectangularShader()
    const envRenderTarget = pmremGenerator.fromEquirectangular(hdriTexture)
    scene.environment = envRenderTarget.texture
    readyFrames.current = 0
    firedReady.current = false

    return () => {
      scene.environment = null
      envRenderTarget.texture.dispose()
      pmremGenerator.dispose()
    }
  }, [gl, scene, hdriTexture])

  // scene.environment landing above doesn't mean it's on screen yet, and
  // neither does Bounds' near-instant camera snap — both only actually reach
  // the screen once r3f's own render loop (tied to this same useFrame) has
  // drawn a frame with them applied. Counting a few of *those* real rendered
  // frames (rather than guessing with a raw rAF/timeout, which isn't tied to
  // r3f's actual render cadence at all) is the one thing that's guaranteed to
  // mean "the correct frame has genuinely been drawn" before telling the
  // caller it's safe to reveal the canvas.
  useFrame(() => {
    if (firedReady.current) return
    readyFrames.current += 1
    if (readyFrames.current >= 3) {
      firedReady.current = true
      onReady?.()
    }
  })

  return null
}

export default function ObjModelViewer({ onPenToggle, onLoadProgress, onReady }) {
  // Gates the canvas's visual reveal behind an opaque DOM mask (not just a
  // WebGL-level clear color) until the scene has *actually* rendered a frame
  // with both the fitted camera position and HDRI lighting applied — not
  // merely once React has committed the elements. There are two gaps between
  // "the model asset finished downloading" and "the screen shows the right
  // thing" that neither `alpha: true` nor Bounds' animation duration close:
  // (1) Bounds' camera snap and HDRIEnvironment's scene.environment
  // assignment each need their own follow-up render to actually reach the
  // screen, so one or more frames can present an unfitted camera and/or
  // unlit materials — on the dark holder material that reads as a dim,
  // blurry-looking frame, not the loader and not the finished shot. Sitting
  // an opaque, page-matched DOM element in front of the canvas the entire
  // time removes the *possibility* of that gap ever being on screen, however
  // briefly, regardless of exactly which frame it would have landed on — the
  // mask only fades away once HDRIEnvironment reports back (see its onReady).
  const [ready, setReady] = useState(false)
  const handleReady = useCallback(() => {
    setReady(true)
    onReady?.()
  }, [onReady])

  return (
    <div className="sharpie-viewer">
      {/* `flat` disables r3f's default ACESFilmicToneMapping, so nothing softens or
          recompresses highlights beyond straightforward sRGB display encoding —
          the closest match to a flat, un-tonemapped 3ds Max viewport preview.
          `gl={{ alpha: true }}` + never setting scene.background keeps the
          WebGL canvas transparent for its entire lifetime — including the
          first frame, before the FBX/HDRI/textures have loaded. Without it
          the canvas clears to opaque black by default. This alone isn't
          enough to prevent every bad-looking frame (see the mask below for
          the rest), but it means whatever the mask ever fails to cover is at
          worst the page's own background, never a black rectangle. */}
      <Canvas
        flat
        gl={{ alpha: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        camera={{ position: [0, 0, 4], fov: 45 }}
        dpr={[1, 2]}
        shadows
      >
        <ambientLight intensity={1.6} />
        <spotLight position={[3, 6, 3]} angle={0.4} penumbra={1} intensity={18} castShadow />
        <pointLight position={[-4, 1, -4]} intensity={6} />
        <Suspense fallback={<Loader />}>
          <HDRIEnvironment url={HDRI_URL} onReady={handleReady} />
          {/* maxDuration: drei's default is 1s, animating the camera from its
              declared start position [0,0,4] to the fitted framing via lerp —
              that's the "loads from the back and zooms in" 1s window. The
              spotlight is tuned for the *final* framing only, so mid-lerp
              angles can catch none of it and read as solid black on the dark
              holder material. Forcing this near-zero makes Bounds jump
              straight to the same final fitted position instead of animating
              into it — same end framing, no transient angles exposed. */}
          {/* margin: how much empty space Bounds leaves around the fitted
              object — lower means the camera sits closer, so the model reads
              larger on screen. Tightened from 1.3 to make the bottle
              slightly bigger while still leaving a clear margin. */}
          <Bounds fit margin={0.96} maxDuration={0.001}>
            <Center position={[0, 0, 0]}>
              <SharpiePenModel onPenToggle={onPenToggle} onLoadProgress={onLoadProgress} />
            </Center>
          </Bounds>
          <ShadowBlob />
        </Suspense>
        <OrbitControls
          makeDefault
          autoRotate
          autoRotateSpeed={1.2}
          enablePan={false}
          // Scroll/pinch zoom would let the user change the model's apparent
          // size away from the fixed framing Bounds just set up — disabled
          // so the size stays exactly as fitted, not user-adjustable.
          enableZoom={false}
          // Vertical orbit only — horizontal (azimuth) stays unrestricted, still
          // a full 360°. Polar angle is measured from world "up" (0 = straight
          // down from above, PI = straight up from below); the camera starts at
          // [0,0,4] looking at the origin, i.e. the default horizontal view sits
          // at PI/2. More room downward (to peek further into the holder's
          // opening) than upward (kept tight so the underside stays out of view).
          minPolarAngle={Math.PI / 2 - 0.6}
          maxPolarAngle={Math.PI / 2 + 0.06}
        />
      </Canvas>
      {/* Fresh useState per mount, so this re-covers correctly every time
          ObjModelViewer mounts, not just on first page load. */}
      <div className={`sharpie-viewer-mask${ready ? ' sharpie-viewer-mask-hidden' : ''}`}>
        <div className="sharpie-viewer-spinner" />
      </div>
    </div>
  )
}
