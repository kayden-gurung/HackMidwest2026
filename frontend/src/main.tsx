import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Global styles: Tailwind, design tokens and fonts from the Figma design.
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
