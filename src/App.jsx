import { useState } from 'react'
import ObjModelViewer from './components/ObjModelViewer'
import './App.css'

const TABS = ['Description', "What's Included", 'Videos']

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

  return (
    <div className="page">
      <section className="product">
        <div className="product-info">
          <h1>PenSense Lite &amp; Notifier Bundle</h1>
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
                <h2>The Ultimate Color Match + Peek System in One Bundle</h2>
                <p>
                  This bundle pairs <strong>PenSense Lite</strong> with the <strong>Notifier 3</strong> to
                  create a fully self-contained, professional-grade color prediction and peek
                  system.
                </p>
                <p>
                  Hand your spectator a set of ordinary colored markers, turn your back, and
                  still know <strong>exactly</strong> which color they&rsquo;ve chosen. At the same time,
                  your <strong>Notifier 3</strong> silently streams real-time information from{' '}
                  <strong>PenSense Lite</strong> (and the wider Unifi ecosystem) to a tiny,
                  high-resolution display hidden wherever you need it.
                </p>
                <p className="disclaimers">
                  No gimmicked pens. No strange handling. No assistants.
                </p>
                <p className="tagline">Just clean, impossible mentalism.</p>
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
          <div className="product-media-primary">
            <ObjModelViewer
              onPenToggle={(color, isOut) => setActivePenColor(isOut ? color : null)}
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
