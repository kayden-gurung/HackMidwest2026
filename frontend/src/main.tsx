import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Global styles: Tailwind, design tokens and fonts.
import './index.css'
import { applyTheme, getInitialTheme } from './lib/theme'

// Set the theme before first render so there is no flash of the wrong colors.
applyTheme(getInitialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
