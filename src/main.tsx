import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './portal-polish.css'

const portalApp = window.location.pathname.match(/^\/apps\/(member|regional-admin|regional-finance|general-finance|super-admin)\/?$/)?.[1]
const memberClientApp = /^\/member\/?$/.test(window.location.pathname)
const appNames: Record<string, string> = {
  member: 'Jamii Yangu Member',
  'regional-admin': 'Jamii Yangu Regional Admin',
  'regional-finance': 'Jamii Yangu Regional Finance',
  'general-finance': 'Jamii Yangu General Finance',
  'super-admin': 'Jamii Yangu Super Admin',
}
if (portalApp || memberClientApp) {
  const appKey = portalApp ?? 'member-client'
  const manifest = document.createElement('link')
  manifest.rel = 'manifest'
  manifest.href = `/manifests/${appKey}.webmanifest`
  document.head.append(manifest)
  if (portalApp) {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.type = 'image/svg+xml'
    icon.href = `/icons/${portalApp}.svg`
    document.head.append(icon)
  }
  document.title = appNames[portalApp ?? 'member'] ?? 'Jamii Yangu Group Cooperative'
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js', { scope: '/' }) })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
