import { useCallback, useEffect, useRef, useState } from 'react'
import ObjModelViewer from './components/ObjModelViewer'
import './App.css'

const TABS = ['Description', "What's Included", 'Videos']

// Loading-screen progress ring geometry: SVG stroke-dasharray/-offset work in
// path-length units, not percent, so the circle's own circumference is the
// conversion factor between "% complete" and how much of the stroke to draw.
const LOADER_RING_RADIUS = 54
const LOADER_RING_CIRCUMFERENCE = 2 * Math.PI * LOADER_RING_RADIUS

const LOGO_IMAGE = '/LOGO.png'
const PEN_IMAGES = {
  red: '/Red.png',
  green: '/Green.png',
  yellow: '/Yellow.png',
  black: '/Black.png',
  blue: '/Blue.png',
  orange: '/Orange.png',
}

const INCLUDED_ITEMS = [
  'PenSense Lite marker set (6 colors)',
  'Notifier 3 receiver',
  'USB-C charging cable',
  'Quick-start guide',
]

const BENEFITS = [
  {
    title: 'Turnkey setup',
    body: "PenSense Lite requires a thumper or Notifier; this bundle includes Notifier 3, so you're ready to perform out of the box.",
  },
  {
    title: 'Works anywhere',
    body: 'No wifi, no bluetooth pairing dance — Notifier 3 links straight to PenSense Lite over the Unifi connection, even across a room.',
  },
  {
    title: 'Built for repeat performance',
    body: 'Rechargeable, reliable, and ready to reset between sets in seconds.',
  },
]

function App() {
  const [activeTab, setActiveTab] = useState('Description')
  const [activePenColor, setActivePenColor] = useState(null)
  // The bottle model is 130MB+ and takes 10-15s to fetch — rather than an
  // indefinite spinner (which reads as "stuck" well before that), track its
  // real download progress and gate the whole page behind it, so visitors
  // see the finished page in one step instead of content popping in before
  // the 3D piece is ready.
  //
  // The raw byte progress isn't shown directly — on a fast connection it
  // arrives in bursts (several events within one frame), which made the
  // number jump straight to "100%" while the bar, animated by a separate
  // CSS transition, was still visually mid-catch-up. Instead, the real
  // progress only updates a *target*; a rAF loop eases a displayed value
  // toward that target every frame, so the number and the bar always move
  // together and the bar is what decides when 100% has actually been
  // reached — the loading screen can't disappear before its own bar is
  // visibly full.
  const targetProgressRef = useRef(0)
  const modelTrulyReadyRef = useRef(false)
  const [displayPct, setDisplayPct] = useState(0)
  const [loaderHidden, setLoaderHidden] = useState(false)

  const handleLoadProgress = useCallback((loaded, total) => {
    targetProgressRef.current = total ? (loaded / total) * 100 : 0
  }, [])
  const handleModelReady = useCallback(() => {
    modelTrulyReadyRef.current = true
    targetProgressRef.current = 100
  }, [])

  useEffect(() => {
    let rafId
    let current = 0
    const tick = () => {
      const target = targetProgressRef.current
      const diff = target - current
      if (diff > 0.05) {
        current = Math.min(current + Math.max(diff * 0.15, 0.6), target)
        setDisplayPct(Math.round(current))
      } else if (current !== target) {
        current = target
        setDisplayPct(Math.round(current))
      }
      if (modelTrulyReadyRef.current && current >= 99.95) {
        setLoaderHidden(true)
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="page">
      {/* Covers the entire viewport (not just the model area) until the
          bottle is fully loaded and rendering correctly — see onReady below,
          the same "genuinely ready, not just asset-fetched" signal
          ObjModelViewer uses for its own smaller in-canvas mask. */}
      <div className={`page-loader${loaderHidden ? ' page-loader-hidden' : ''}`} aria-hidden={loaderHidden}>
        <div className="page-loader-content">
          <div className="page-loader-ring">
            <svg className="page-loader-ring-svg" viewBox="0 0 120 120">
              <circle className="page-loader-ring-track" cx="60" cy="60" r={LOADER_RING_RADIUS} />
              <circle
                className="page-loader-ring-progress"
                cx="60"
                cy="60"
                r={LOADER_RING_RADIUS}
                strokeDasharray={LOADER_RING_CIRCUMFERENCE}
                strokeDashoffset={LOADER_RING_CIRCUMFERENCE * (1 - displayPct / 100)}
              />
            </svg>
            <div className="page-loader-ring-center">
              <img className="page-loader-logo" src="/loading%20logo%20changed.png" alt="Illuminati Magic" />
              <span className="page-loader-pct">{displayPct}%</span>
            </div>
          </div>
          <p className="page-loader-label">Getting ready</p>
        </div>
      </div>
      <section className="product">
        <div className="product-info">
          {/* <h1>PenSense Lite &amp; Notifier Bundle</h1> */}
          {/* <p className="product-subtitle">Color Match Set</p> */}
          {/* <p className="product-price">$249</p> */}

          {/* <div className="product-actions">
            <button type="button" className="btn-secondary">
              Add to Bag
            </button>
            <button type="button" className="btn-shop">
              Buy with <span className="shop-wordmark">shop</span>
            </button>
          </div> */}

          {/* <div className="product-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={`tab${activeTab === tab ? ' tab-active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div> */}

          <div className="product-tab-panel">
            {activeTab === 'Description' && (
              <div className="tab-description">
                <h1>PenSense Lite &amp; Notifier Bundle</h1>
                <p>
                  This bundle pairs <strong>PenSense Lite</strong> with the <strong>Notifier 3</strong> to
                  create a fully self-contained, professional-grade color prediction and peek
                  system.
                </p>
              </div>
            )}

            {activeTab === "What's Included" && (
              <ul className="tab-included">
                {INCLUDED_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}

            {activeTab === 'Videos' && (
              <p className="tab-videos">Performance demos and setup videos coming soon.</p>
            )}
          </div>

          {/* <div className="product-benefits">
            <h3>Why performers love this bundle</h3>
            <ul>
              {BENEFITS.map((b) => (
                <li key={b.title}>
                  <strong>{b.title}</strong> — {b.body}
                </li>
              ))}
            </ul>
          </div> */}
        </div>

        <div className="product-media">
          <p className="product-hint">
            <span className="product-hint-dot" aria-hidden="true" />
            Hit the pen
          </p>
          <div className="product-media-primary">
            <ObjModelViewer
              onPenToggle={(color, isOut) => setActivePenColor(isOut ? color : null)}
              onLoadProgress={handleLoadProgress}
              onReady={handleModelReady}
            />
          </div>
        </div>

        <div className="product-spacer">
          <img
            className="notifier-image"
            src={activePenColor ? PEN_IMAGES[activePenColor] : LOGO_IMAGE}
            alt={activePenColor ? `Notifier 3 showing ${activePenColor}` : 'Notifier 3'}
          />
        </div>
      </section>
    </div>
  )
}

export default App
