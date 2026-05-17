import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AnalyticsProvider } from '@gitspexx/spexx-analytics'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AnalyticsProvider
      config={{
        appName: 'insiderguide',
        ga4Id: import.meta.env.VITE_GA4_ID,
        metaPixelId: import.meta.env.VITE_META_PIXEL_ID,
        tiktokPixelId: import.meta.env.VITE_TIKTOK_PIXEL_ID,
        capiRelayUrl: import.meta.env.VITE_CAPI_RELAY_URL,
        consentMode: 'always',
        debug: import.meta.env.DEV,
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AnalyticsProvider>
  </StrictMode>,
)
