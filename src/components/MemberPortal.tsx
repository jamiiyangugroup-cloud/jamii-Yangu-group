import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, Bell, CheckCircle2, CircleDollarSign, Clock3, FileText, HandCoins, LogOut, Menu, RefreshCw, ShieldCheck, TrendingUp, UsersRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Logo from './Logo'
import MemberLifeHub from './MemberLifeHub'
import '../member.css'
import '../member-responsive.css'

type MemberWorkspaceData = {
  member: null | { id:string; county_id:string; membership_number: string; status: string; approved_at: string; county: string; branch: string | null; display_name: string }
  applications: { id: string; status: string; payment_status: string; created_at: string }[]
  monthly_contribution_due_kes: number | null
  contributions: { verified_months: number; verified_total_kes: number; current_month_paid: boolean; assistance_eligible: boolean | null }
  active_loans: number
  assistance_requests: number
  active_investments: number
  notifications: { id: string; title: string; body: string; created_at: string; read_at: string | null }[]
}

const money = (value: number) => `KES ${Number(value || 0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const isMobilePortalLayout = () => window.innerWidth <= 900 || (window.innerWidth <= 1024 && window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches)

export default function MemberPortal() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspace, setWorkspace] = useState<MemberWorkspaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileLayout, setMobileLayout] = useState(isMobilePortalLayout)

  useEffect(() => {
    const updateLayout = () => {
      const mobile = isMobilePortalLayout()
      setMobileLayout(mobile)
      if (!mobile) setMenuOpen(false)
    }
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape) }
  }, [menuOpen])

  const loadWorkspace = useCallback(async (activeSession: Session) => {
    if (!supabase) return
    setSession(activeSession); setLoading(true); setError('')
    const { data, error: loadError } = await supabase.rpc('get_my_member_workspace')
    if (loadError) { setWorkspace(null); setError('We could not load your member workspace. Confirm your email or contact member support.') }
    else setWorkspace(data as MemberWorkspaceData)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    void supabase.auth.getSession().then(({ data }) => data.session ? loadWorkspace(data.session) : setLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (next) setSession(next)
      else { setSession(null); setWorkspace(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [loadWorkspace])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) { setError('The cooperative Supabase project is not configured yet.'); return }
    setBusy(true); setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setBusy(false)
    if (authError) { setError('Sign-in failed. Check your email and password, then try again.'); return }
    if (data.session) await loadWorkspace(data.session)
  }

  async function signOut() {
    const { error: signOutError } = await supabase?.auth.signOut() ?? { error: null }
    if (signOutError) { setError('We could not sign you out. Check your connection and try again.'); return }
    setPassword(''); setWorkspace(null); setSession(null); setMenuOpen(false)
  }

  return <div className="member-app"><header className="member-topbar"><Logo homePath="/"/><div className="member-header-actions"><a href="/" className="member-home-link">Cooperative website</a>{session && <button onClick={() => void signOut()} className="member-signout"><LogOut size={15}/> Sign out</button>}<button className="member-nav-toggle" aria-label={menuOpen ? 'Close member navigation' : 'Open member navigation'} aria-expanded={menuOpen} aria-controls="member-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={20}/> : <Menu size={20}/>}</button></div>{menuOpen && <button type="button" className="member-nav-scrim" aria-label="Close member navigation" onClick={() => setMenuOpen(false)}/>}<nav id="member-navigation" className={`member-drawer ${menuOpen ? 'is-open' : ''}`} aria-hidden={mobileLayout && !menuOpen}>{session ? <><a href="#member-overview" onClick={() => setMenuOpen(false)}>My overview</a><a href="#my-applications" onClick={() => setMenuOpen(false)}>My applications</a><a href="#my-updates" onClick={() => setMenuOpen(false)}>Cooperative updates</a><a href="#member-life-hub" onClick={() => setMenuOpen(false)}>Planning and member services</a></> : <><a href="/" onClick={() => setMenuOpen(false)}>Cooperative website</a><a href="/?join=1" onClick={() => setMenuOpen(false)}>Register for membership</a></>}</nav></header>
    {!session && !loading && <main className="member-auth"><div className="member-auth-copy"><span className="member-eyebrow">YOUR JAMII YANGU WORKSPACE</span><h1>Your progress,<br/>all in <em>one place.</em></h1><p>Check your membership, contributions, requests and cooperative updates through your private member account.</p><div className="member-trust"><ShieldCheck size={17}/> Your records are private to your account.</div></div><section className="member-auth-card"><span className="member-eyebrow">MEMBER ACCESS</span><h2>Welcome back.</h2><p>Sign in to view your cooperative workspace.</p><form onSubmit={signIn} className="member-form"><label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/></label>{error && <div className="member-error" role="alert">{error}</div>}<button className="member-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}<ArrowRight size={16}/></button></form><p className="member-join">New to Jamii Yangu? <a href="/?join=1">Apply for membership</a></p></section></main>}
    {loading && <main className="member-loading"><span/> Loading your secure member workspace…</main>}
    {session && !loading && <main id="member-overview" className="member-dashboard"><div className="member-welcome"><div><span className="member-eyebrow">MY JAMII YANGU</span><h1>{workspace?.member ? `Welcome, ${workspace.member.display_name || 'member'}.` : 'Your member workspace.'}</h1><p>{workspace?.member ? `${workspace.member.membership_number} · ${workspace.member.county}${workspace.member.branch ? ` · ${workspace.member.branch} Branch` : ''}` : 'Your applications and cooperative updates appear here.'}</p></div><button className="member-refresh" onClick={() => void loadWorkspace(session)} disabled={busy}><RefreshCw size={15}/> Refresh</button></div>
      {error && <div className="member-error" role="alert">{error}</div>}
      {workspace?.member && <div className="member-status-bar"><span className="member-status"><i/>{workspace.member.status.replace(/_/g,' ')}</span><span>{workspace.monthly_contribution_due_kes == null ? 'Contribution policy not configured' : `Monthly contribution ${money(workspace.monthly_contribution_due_kes)}`}</span><span className={workspace.contributions.current_month_paid ? 'paid' : 'due'}>{workspace.contributions.current_month_paid ? <CheckCircle2 size={15}/> : <Clock3 size={15}/>} {workspace.contributions.current_month_paid ? 'This month paid' : 'Payment not recorded'}</span></div>}
      <section className="member-metrics">{[
        { label: 'Verified contributions', value: money(workspace?.contributions.verified_total_kes ?? 0), note: `${workspace?.contributions.verified_months ?? 0} verified months`, icon: <CircleDollarSign/> },
        { label: 'Assistance eligibility', value: workspace?.contributions.assistance_eligible == null ? 'Policy not configured' : workspace.contributions.assistance_eligible ? 'Eligible' : 'In progress', note: 'Based on approved cooperative policy', icon: <HandCoins/> },
        { label: 'Active loans', value: String(workspace?.active_loans ?? 0), note: 'Authorized and active', icon: <FileText/> },
        { label: 'Investment positions', value: String(workspace?.active_investments ?? 0), note: 'Approved records only', icon: <TrendingUp/> },
      ].map((metric) => <article className="member-metric" key={metric.label}><span>{metric.icon}</span><small>{metric.label}</small><strong>{metric.value}</strong><p>{metric.note}</p></article>)}</section>
      <div className="member-columns"><section id="my-applications" className="member-panel"><div className="member-panel-head"><span><FileText size={17}/></span><h2>My applications</h2></div>{workspace?.applications.length ? workspace.applications.map((app) => <article className="member-application" key={app.id}><div><strong>{app.status.replace(/_/g,' ')}</strong><small>Submitted {new Date(app.created_at).toLocaleDateString('en-KE')}</small></div><span>{app.payment_status.replace(/_/g,' ')}</span></article>) : <p className="member-empty-copy">No membership application is linked to this account yet.</p>}</section><section id="my-updates" className="member-panel"><div className="member-panel-head"><span><Bell size={17}/></span><h2>Cooperative updates</h2></div>{workspace?.notifications.length ? workspace.notifications.map((notice) => <article className="member-notice" key={notice.id}><i className={notice.read_at ? '' : 'unread'}/><div><strong>{notice.title}</strong><p>{notice.body}</p><small>{new Date(notice.created_at).toLocaleDateString('en-KE')}</small></div></article>) : <p className="member-empty-copy">Your cooperative notices will appear here.</p>}</section></div>
      {!workspace?.member && <section className="member-next-step"><span><UsersRound size={19}/></span><div><strong>Membership application</strong><p>Your account is active, but an approved membership record has not been created yet.</p><a href="/?join=1">View membership options <ArrowRight size={14}/></a></div></section>}
      <MemberLifeHub session={session} memberId={workspace?.member?.id ?? null}/>
    </main>}
    <footer className="member-footer"><span>I grow, we grow, community grows.</span><a href="/">Jamii Yangu Group Cooperative</a></footer>
  </div>
}
