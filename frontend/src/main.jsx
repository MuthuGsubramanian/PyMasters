import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (same origin, immutable cache): the Google Fonts stylesheet was the slowest
// render-blocking request on mobile (~0.9 s: two extra third-party connections before first paint).
import '@fontsource-variable/inter'
import '@fontsource-variable/outfit'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
