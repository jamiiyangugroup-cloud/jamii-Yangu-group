import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, BadgeCheck, Building2, CircleDollarSign, ClipboardList, KeyRound, LogOut, Menu, RefreshCw, ShieldCheck, UsersRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Logo from './Logo'
import '../staff.css'
import '../staff-responsive.css'

type Portal = { portal_key: string; role_key: string; region_id: string | null; region_name: string | null }
type Summary = Record<string, number>
const isMobilePortalLayout = () => window.innerWidth <= 900 || (window.innerWidth <= 1024 && window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches)

const portalNames: Record<string, string> = {
  'super-admin': 'Super Admin',
  'super-finance': 'General Finance',
  'regional-admin': 'Regional Admin',
  'regional-finance': 'Regional Finance',
}
const metricNames: Record<string, string> = {
  active_members: 'Active members',
  pending_applications: 'Applications to review',
  pending_kyc: 'KYC documents to review',
  pending_loans: 'Loan applications',
  pending_assistance: 'Assistance requests',
  contributions_this_month_kes: 'Verified contributions this month',
  verified_payments_this_month_kes: 'Verified payments this month',
}

export default function StaffPortal() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [portals, setPortals] = useState<Portal[]>([])
  const [selected, setSelected] = useState<Portal | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<'loading' | 'login' | 'mfa' | 'enroll' | 'workspace'>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(isMobilePortalLayout)

  useEffect(() => {
    const updateLayout = () => {
      const mobile = isMobilePortalLayout()
      setMobileSidebar(mobile)
      if (!mobile) setSidebarOpen(false)
    }
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape) }
  }, [sidebarOpen])

  const loadPortals = useCallback(async (activeSession: Session) => {
    if (!supabase) return
    setSession(activeSession)
    setError('')
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError) { setError('Could not verify your security session. Sign in again.'); setPhase('login'); return }
    if (assurance.currentLevel !== 'aal2') {
      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors()
      const verified = factors?.totp?.find((factor) => factor.status === 'verified')
      if (verified) { setFactorId(verified.id); setPhase('mfa') }
      else if (factorError) { setError('Could not check your MFA setup. Please sign in again.'); setPhase('login') }
      else setPhase('enroll')
      return
    }
    const { data, error: accessError } = await supabase.rpc('get_my_staff_portals')
    if (accessError) { setPortals([]); setSelected(null); setPhase('workspace'); setError('Your account has no active staff portal assignment. Contact an authorized cooperative administrator.') ; return }
    const available = (data ?? []) as Portal[]
    setPortals(available)
    setSelected((current) => current && available.some((portal) => portal.portal_key === current.portal_key && portal.region_id === current.region_id) ? current : available[0] ?? null)
    setPhase('workspace')
  }, [])

  useEffect(() => {
    if (!supabase) { setPhase('login'); return }
    void supabase.auth.getSession().then(({ data }) => data.session ? loadPortals(data.session) : setPhase('login'))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (next) setSession(next)
      else { setSession(null); setPortals([]); setSelected(null); setSummary(null); setPhase('login') }
    })
    return () => subscription.unsubscribe()
  }, [loadPortals])

  const loadSummary = useCallback(async (portal: Portal) => {
    if (!supabase) return
    setBusy(true); setError(''); setSummary(null)
    const { data, error: summaryError } = await supabase.rpc('get_staff_portal_summary', {
      p_portal_key: portal.portal_key,
      p_region_id: portal.region_id,
    })
    if (summaryError) { setSummary(null); setError('The portal summary could not be loaded. Your access may have changed; sign in again or contact support.') }
    else setSummary(data as Summary)
    setBusy(false)
  }, [])

  useEffect(() => { if (selected && phase === 'workspace') void loadSummary(selected) }, [selected, phase, loadSummary])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) { setError('The cooperative Supabase project is not configured.'); return }
    setBusy(true); setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setBusy(false)
    if (authError) { setError('Sign-in failed. Check your details or contact the cooperative administrator.'); return }
    if (data.session) await loadPortals(data.session)
  }

  async function startMfaSetup() {
    if (!supabase) return
    setBusy(true); setError('')
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Jamii Yangu staff portal' })
    setBusy(false)
    if (enrollError || !data) { setError('MFA setup could not be started. Try again or contact support.'); return }
    setFactorId(data.id); setQrCode(data.totp.qr_code); setPhase('enroll')
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !factorId || !/^\d{6}$/.test(code)) { setError('Enter the six-digit code from your authenticator app.'); return }
    setBusy(true); setError('')
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setBusy(false)
    if (verifyError) { setError('That verification code was not accepted. Check your authenticator app and try again.'); return }
    const { data } = await supabase.auth.getSession()
    if (data.session) await loadPortals(data.session)
  }

  async function signOut() {
    await supabase?.auth.signOut()
    setPassword(''); setSummary(null); setSelected(null); setPortals([]); setSidebarOpen(false); setPhase('login')
  }

  const title = selected ? portalNames[selected.portal_key] : 'Staff workspace'
  const scopeName = selected?.region_name ?? 'Organization wide'
  const portalDescriptions: Record<string,string> = {
    'super-admin':'Organization-wide administration and oversight. Financial approvals remain subject to their separate controls.',
    'super-finance':'Organization-wide financial oversight across all regions. Operational reconciliation and report approval actions are not yet available in this portal.',
    'regional-admin':'Administrative activity and member application summaries for your assigned region only.',
    'regional-finance':'Financial summaries for your assigned region only. Regional report submission and reconciliation actions are not yet available.',
  }

  return <div className="staff-app">
    <header className="staff-topbar"><Logo homePath="/"/><div className="staff-header-right"><span className="staff-secure"><ShieldCheck size={15}/> Secure staff access</span>{phase === 'workspace' && session && <button className="staff-nav-toggle" aria-label={sidebarOpen ? 'Close portal navigation' : 'Open portal navigation'} aria-expanded={sidebarOpen} aria-controls="staff-navigation" onClick={() => setSidebarOpen((open) => !open)}>{sidebarOpen ? <X size={20}/> : <Menu size={20}/>}</button>}{session && <button className="staff-logout" onClick={() => void signOut()}><LogOut size={16}/> Sign out</button>}</div></header>
    {phase === 'loading' ? <main className="staff-loading"><span className="staff-spinner"/> Checking your secure workspace…</main> : null}
    {phase === 'login' && <main className="staff-auth-layout"><section className="staff-auth-aside"><div className="staff-kicker">JAMII YANGU · STAFF</div><h1>Work that helps<br/>our community <em>grow.</em></h1><p>Secure workspaces for cooperative administration and finance teams.</p><div className="staff-assurance"><ShieldCheck size={18}/> Protected by verified role assignments and multi-factor authentication.</div></section><section className="staff-auth-card"><div className="staff-kicker">AUTHORIZED PERSONNEL</div><h2>Staff sign in</h2><p>Use your cooperative account to access your assigned workspace.</p><form onSubmit={signIn} className="staff-form"><label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/></label>{error && <p className="staff-error" role="alert">{error}</p>}<button className="staff-primary" disabled={busy}>{busy ? 'Checking…' : 'Continue securely'}<KeyRound size={16}/></button></form><div className="staff-auth-foot"><ShieldCheck size={15}/> Staff accounts are provisioned by an authorized administrator. No public staff registration.</div></section></main>}
    {(phase === 'enroll' || phase === 'mfa') && <main className="staff-mfa-wrap"><section className="staff-mfa-card"><span className="staff-mfa-icon"><ShieldCheck/></span><div className="staff-kicker">MULTI-FACTOR SECURITY</div><h1>{phase === 'enroll' ? 'Secure your staff account.' : 'Verify it’s you.'}</h1>{phase === 'enroll' ? <><p>Privileged cooperative workspaces require an authenticator app. Scan this QR code, then enter the six-digit code it generates.</p>{qrCode ? <img className="staff-qr" src={qrCode} alt="Authenticator setup QR code"/> : <button className="staff-primary" onClick={() => void startMfaSetup()} disabled={busy}>{busy ? 'Preparing…' : 'Set up authenticator'}<ShieldCheck size={16}/></button>}</> : <p>Enter the six-digit code from your authenticator app to continue to your assigned portal.</p>}<form onSubmit={verifyMfa} className="staff-form"><label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required/></label>{error && <p className="staff-error" role="alert">{error}</p>}<button className="staff-primary" disabled={busy || !factorId}>{busy ? 'Verifying…' : phase === 'enroll' ? 'Verify and enable MFA' : 'Verify and continue'}<ArrowLeft size={16}/></button></form></section></main>}
    {phase === 'workspace' && <div className="staff-workspace">{sidebarOpen && <button type="button" className="staff-sidebar-scrim" aria-label="Close portal navigation" onClick={() => setSidebarOpen(false)}/>}<aside id="staff-navigation" className={`staff-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-hidden={!sidebarOpen && mobileSidebar}><div className="staff-side-label">YOUR AUTHORIZED PORTALS</div>{portals.map((portal) => <button key={`${portal.portal_key}-${portal.region_id}`} className={`staff-portal-choice ${selected?.portal_key === portal.portal_key && selected?.region_id === portal.region_id ? 'active' : ''}`} onClick={() => { setSelected(portal); setSidebarOpen(false) }}><span>{portal.portal_key.includes('finance') ? <CircleDollarSign size={17}/> : <Building2 size={17}/>}</span><span>{portalNames[portal.portal_key]}{portal.region_name && <small>{portal.region_name} Region</small>}</span></button>)}{!portals.length && <div className="staff-no-access"><ShieldCheck size={20}/><strong>No active portal</strong><small>{error || 'Your account is not assigned to a staff workspace.'}</small></div>}<a href="/" className="staff-member-link" onClick={() => setSidebarOpen(false)}><ArrowLeft size={15}/> Customer website</a></aside><main className="staff-main"><div className="staff-page-head"><div><div className="staff-kicker">{selected ? portalNames[selected.portal_key] : 'SECURE WORKSPACE'}</div><h1>{title}</h1><p><Building2 size={14}/> {scopeName} <span className="staff-dot">·</span> <span className="staff-live"><i/> Live, access-controlled data</span></p></div><button className="staff-refresh" onClick={() => selected && void loadSummary(selected)} disabled={busy}><RefreshCw size={15} className={busy ? 'spinning' : ''}/> Refresh</button></div>{error && <div className="staff-inline-error" role="status">{error}</div>}{selected && summary && <><section className="staff-metric-grid">{Object.entries(summary).map(([key, value]) => <article className="staff-metric" key={key}><span className="staff-metric-icon">{key.includes('member') ? <UsersRound size={18}/> : key.includes('payment') || key.includes('contribution') ? <CircleDollarSign size={18}/> : <ClipboardList size={18}/>}</span><small>{metricNames[key] ?? key.replace(/_/g,' ')}</small><strong>{key.endsWith('_kes') ? `KES ${Number(value).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}` : Number(value).toLocaleString('en-KE')}</strong></article>)}</section><section className="staff-data-panel"><div className="staff-panel-icon"><BadgeCheck size={18}/></div><div><h2>{title} · Authorized summary</h2><p>{portalDescriptions[selected.portal_key]} Figures shown here are live database summaries, scoped to your assigned permissions.</p></div></section></>}{selected && !summary && !busy && !error && <div className="staff-empty"><ClipboardList/><h2>No summary data available</h2><p>Summary values will appear when this workspace has records in its authorized scope.</p></div>}{!selected && <div className="staff-empty"><ShieldCheck/><h2>Staff access required</h2><p>Contact an authorized cooperative administrator if you believe this account should have a portal assignment.</p></div>}</main></div>}
  </div>
}
