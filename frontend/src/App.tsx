import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState('checking...')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(d.ok ? 'backend ok' : 'backend error'))
      .catch(() => setHealth('backend unreachable'))
  }, [])

  return (
    <main>
      <h1>HackMidwest2026</h1>
      <p>{health}</p>
    </main>
  )
}
