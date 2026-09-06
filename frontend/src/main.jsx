import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import TenantBrandingProvider from './context/TenantBrandingProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TenantBrandingProvider><App /></TenantBrandingProvider>
  </StrictMode>,
)
