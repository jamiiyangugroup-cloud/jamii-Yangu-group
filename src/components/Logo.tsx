type LogoProps = { compact?: boolean; homePath?: string }

export default function Logo({ compact = false, homePath = '#home' }: LogoProps) {
  const destination=window.location.pathname.startsWith('/apps/member')&&homePath==='/member#dashboard'?'/apps/member#dashboard':homePath
  return <a className={`brand ${compact ? 'brand-compact' : ''}`} href={destination} aria-label="Jamii Yangu home">
    <img src="/jamii-yangu-emblem.png" alt="" />
    <span className="brand-copy"><strong>JAMII YANGU</strong><small>GROUP COOPERATIVE</small></span>
  </a>
}
