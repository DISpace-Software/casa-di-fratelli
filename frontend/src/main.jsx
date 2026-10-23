import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SeasonalZonesProvider from './context/SeasonalZonesProvider.jsx'
import TenantBrandingProvider from './context/TenantBrandingProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TenantBrandingProvider><SeasonalZonesProvider><App /></SeasonalZonesProvider></TenantBrandingProvider>
  </StrictMode>,
)
