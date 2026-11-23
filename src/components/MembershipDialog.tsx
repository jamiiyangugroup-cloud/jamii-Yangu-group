import { FormEvent, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, BadgeCheck, Eye, EyeOff, ShieldCheck, X } from 'lucide-react'
import Logo from './Logo'
import { supabase, supabaseConfigured } from '../lib/supabase'

type Application = { id: string; status: string; created_at: string; registration_payment_status: string }
type Location = { id: string; name: string }

export default function MembershipDialog({ onClose, initialMode = 'signup' }: { onClose: () => void; initialMode?: 'signup' | 'signin' }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authMode, setAuthMode] = useState<'signup' | 'signin' | 'reset' | 'update'>(initialMode)
  const [applications, setApplications] = useState<Application[]>([])
  const [counties, setCounties] = useState<Location[]>([])
  const [subCounties, setSubCounties] = useState<Location[]>([])
  const [countyId, setCountyId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')

  useEffect(() => {
    if (!supabase) return
    if (new URLSearchParams(window.location.search).get('mode') === 'recovery' || window.location.hash.includes('type=recovery')) setAuthMode('update')
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setAuthMode('update')
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) { setApplications([]); return }
    void supabase.from('membership_applications').select('id,status,created_at,registration_payment_status')
      .order('created_at', { ascending: false }).then(({ data }) => setApplications((data ?? []) as Application[]))
    void supabase.from('counties').select('id,name').eq('active', true).order('name')
      .then(({ data }) => setCounties((data ?? []) as Location[]))
  }, [session])

  useEffect(() => {
    if (!supabase || !countyId) { setSubCounties([]); return }
    void supabase.from('sub_counties').select('id,name').eq('county_id', countyId).eq('active', true).order('name')
      .then(({ data }) => setSubCounties((data ?? []) as Location[]))
  }, [countyId])

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    if (!supabase) { setError('Supabase is not configured. Copy .env.example to .env.local and add your project URL and publishable key.'); setBusy(false); return }
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    try {
      if (authMode === 'signup') {
        if (form.get('termsAccepted') !== 'on' || form.get('privacyAccepted') !== 'on') throw new Error('Accept the terms and privacy notice to create an account.')
        const password = String(form.get('password') ?? '')
        const confirmPassword = String(form.get('confirmPassword') ?? '')
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) throw new Error('Use at least 8 characters with uppercase and lowercase letters, a number and a symbol.')
        if (password !== confirmPassword) throw new Error('The passwords do not match.')
        const firstName = String(form.get('firstName') ?? '').trim()
        const middleName = String(form.get('middleName') ?? '').trim()
        const lastName = String(form.get('lastName') ?? '').trim()
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { first_name:firstName, middle_name:middleName, last_name:lastName, display_name:[firstName,middleName,lastName].filter(Boolean).join(' '), date_of_birth:String(form.get('dateOfBirth')||''), gender:String(form.get('gender')||''), phone_number:String(form.get('phoneNumber')||''), county:String(form.get('county')||''), town:String(form.get('town')||'') } } })
        if (authError) throw authError
        if (data.session) setSession(data.session)
        else { setVerificationEmail(email); setAuthMode('signin'); setMessage('Account created. Check your inbox for the verification link before signing in.') }
      } else if (authMode === 'signin') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password: String(form.get('password') ?? '') })
        if (authError) throw authError
        if (data.session) window.location.assign('/member')
      } else if (authMode === 'reset') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?mode=recovery` })
        if (authError) throw authError
        setMessage('If that address has an account, a password reset link has been sent.')
      } else {
        const { error: authError } = await supabase.auth.updateUser({ password: String(form.get('password') ?? '') })
        if (authError) throw authError
        const returnUrl = new URL(window.location.href); returnUrl.searchParams.delete('mode'); window.history.replaceState({}, '', returnUrl)
        setAuthMode('signin'); setMessage('Password updated successfully.')
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'We could not complete that authentication request. Check the details and try again.') }
    finally { setBusy(false) }
  }

  async function resendVerification() {
    if (!supabase || !verificationEmail) return
    setBusy(true); setError(''); setMessage('')
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: verificationEmail, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (resendError) setError('We could not resend the verification email. Wait a moment and try again.')
    else setMessage('If the account is awaiting verification, a new link has been sent.')
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    if (!supabase || !session?.user.email_confirmed_at) { setError('Verify your email and sign in before submitting an application.'); setBusy(false); return }
    if (!countyId || !subCounties.length) { setError('County and sub-county options are not configured yet. Please try again later.'); setBusy(false); return }
    const form = new FormData(event.currentTarget)
    const payload = {
      user_id: session.user.id,
      full_legal_name: String(form.get('fullLegalName') ?? '').trim(),
      date_of_birth: String(form.get('dateOfBirth') ?? ''),
      gender: String(form.get('gender') ?? '') || null,
      phone_number: String(form.get('phoneNumber') ?? '').trim(),
      email_address: session.user.email,
      county_id: countyId,
      sub_county_id: String(form.get('subCountyId') ?? ''),
      physical_address: String(form.get('physicalAddress') ?? '').trim(),
      occupation: String(form.get('occupation') ?? '').trim(),
      next_of_kin_name: String(form.get('nextOfKinName') ?? '').trim(),
      next_of_kin_phone: String(form.get('nextOfKinPhone') ?? '').trim(),
      category_id: String(form.get('categoryId') ?? '') || null,
      terms_accepted: form.get('termsAccepted') === 'on',
      privacy_accepted: form.get('privacyAccepted') === 'on',
      consented_at: new Date().toISOString(),
    }
    const { error: insertError } = await supabase.from('membership_applications').insert(payload)
    if (insertError) setError('The application could not be submitted. Check that your email is verified and location information is complete.')
    else { setComplete(true); void supabase.from('membership_applications').select('id,status,created_at,registration_payment_status').order('created_at', { ascending: false }).then(({ data }) => setApplications((data ?? []) as Application[])) }
    setBusy(false)
  }

  const title = authMode === 'signup' ? 'Create your account.' : authMode === 'signin' ? 'Welcome back.' : authMode === 'reset' ? 'Reset your password.' : 'Choose a new password.'

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal membership-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="modal-close" onClick={onClose} aria-label="Close"><X /></button><Logo compact />
      {!supabaseConfigured && <div className="preview-notice setup-warning"><ShieldCheck size={18}/><span>Complete the form and checks now. Account creation, verification and sign-in will work once the Supabase project URL and publishable key are configured.</span></div>}
      {session && authMode !== 'update' ? <>
        <div className="modal-heading"><div className="eyebrow"><span className="eyebrow-dot" /> SECURE MEMBER ACCESS</div><h2 id="modal-title">Your Jamii Yangu account</h2><p>Signed in as {session.user.email}. Applications remain pending until payment and authorized review are complete.</p></div>
        {complete && <div className="success-state compact-success"><span className="success-icon"><BadgeCheck/></span><strong>Application submitted.</strong><p>No payment was collected. The application will appear below once its saved record is loaded.</p></div>}
        <div className="application-list"><h3>My applications</h3>{applications.length ? applications.map((application) => <article key={application.id}><div><strong>{application.status.replace(/_/g,' ')}</strong><small>Submitted {new Date(application.created_at).toLocaleDateString()}</small></div><span>{application.registration_payment_status.replace(/_/g,' ')}</span></article>) : <p>No membership applications yet.</p>}</div>
        <form className="application-form" onSubmit={submitApplication}>
          <h3>Membership application</h3>
          {!session.user.email_confirmed_at && <p className="form-error">Verify your email before sending an application.</p>}
          {session.user.email_confirmed_at && !counties.length && <p className="preview-notice">The cooperative's verified county directory has not been configured yet, so applications cannot be submitted.</p>}
          <label>Full legal name<input name="fullLegalName" autoComplete="name" maxLength={160} required /></label>
          <div className="form-row"><label>Date of birth<input name="dateOfBirth" type="date" autoComplete="bday" required /></label><label>Gender <span className="optional-label">(optional)</span><select name="gender" defaultValue=""><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Another identity</option></select></label></div>
          <label>Phone number<input name="phoneNumber" type="tel" autoComplete="tel" placeholder="+254 7XX XXX XXX" required /></label>
          <div className="form-row"><label>County<select value={countyId} onChange={(e) => setCountyId(e.target.value)} required><option value="">Choose county</option>{counties.map((county) => <option key={county.id} value={county.id}>{county.name}</option>)}</select></label><label>Sub-county<select name="subCountyId" required disabled={!subCounties.length}><option value="">Choose sub-county</option>{subCounties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          <label>Physical address<input name="physicalAddress" autoComplete="street-address" required /></label><label>Occupation<input name="occupation" autoComplete="organization-title" required /></label>
          <div className="form-row"><label>Next of kin name<input name="nextOfKinName" required /></label><label>Next of kin phone<input name="nextOfKinPhone" type="tel" placeholder="+254 7XX XXX XXX" required /></label></div>
          <label className="consent"><input type="checkbox" name="termsAccepted" required/><span>I agree to the <a href="/terms.html" target="_blank" rel="noreferrer">membership terms</a>.</span></label>
          <label className="consent"><input type="checkbox" name="privacyAccepted" required/><span>I have read the <a href="/privacy.html" target="_blank" rel="noreferrer">privacy notice</a> and consent to processing my application details.</span></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary form-submit" disabled={busy || !session.user.email_confirmed_at || !counties.length}>{busy ? 'Submitting…' : 'Submit application'} {!busy && <ArrowRight size={16}/>}</button>
          <p className="dialog-hint">This submits an application only. The KSh 300 fee is not charged here. Payment verification and membership approval are separate steps.</p>
        </form>
        <button className="footer-login" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
      </> : <>
        <div className="dialog-tabs"><button className={authMode==='signup'?'selected':''} onClick={() => {setAuthMode('signup');setError('');setMessage('')}}>Create account</button><button className={authMode==='signin'?'selected':''} onClick={() => {setAuthMode('signin');setError('');setMessage('')}}>Sign in</button></div>
        <div className="modal-heading"><div className="eyebrow"><span className="eyebrow-dot" /> EMAIL-VERIFIED ACCESS</div><h2 id="modal-title">{title}</h2><p>Supabase Auth secures your account. Administrative permissions are assigned through authorized cooperative processes.</p></div>
        <form className="application-form" onSubmit={authenticate}>
          {authMode==='signup' && <>
            <h3>Personal information</h3>
            <div className="form-row"><label>First name<input name="firstName" autoComplete="given-name" maxLength={80} required/></label><label>Middle name <span className="optional-label">(optional)</span><input name="middleName" autoComplete="additional-name" maxLength={80}/></label></div>
            <div className="form-row"><label>Last name<input name="lastName" autoComplete="family-name" maxLength={80} required/></label><label>Date of birth<input name="dateOfBirth" type="date" autoComplete="bday" max={new Date().toISOString().slice(0,10)} required/></label></div>
            <div className="form-row"><label>Gender <span className="optional-label">(optional)</span><select name="gender" defaultValue=""><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Another identity</option></select></label><label>Phone number<input name="phoneNumber" type="tel" autoComplete="tel" pattern="[+]?[0-9 ()-]{9,20}" placeholder="+254 7XX XXX XXX" required/></label></div>
            <div className="form-row"><label>County <span className="optional-label">(optional)</span><input name="county" autoComplete="address-level1" maxLength={80}/></label><label>Town / location <span className="optional-label">(optional)</span><input name="town" autoComplete="address-level2" maxLength={100}/></label></div>
          </>}
          {authMode!=='update' && <label>Email address<input type="email" name="email" autoComplete="email" required />
            {authMode==='signin' && <span className="auth-inline"><input type="checkbox" name="rememberMe" defaultChecked/><span>Remember me</span></span>}</label>}
          {authMode!=='reset' && <label>Password<div className="password-control"><input type={showPassword?'text':'password'} name="password" autoComplete={authMode==='signup'?'new-password':authMode==='update'?'new-password':'current-password'} minLength={authMode==='update'?12:authMode==='signup'?8:1} required/><button type="button" onClick={()=>setShowPassword((visible)=>!visible)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>}
          {authMode==='signup' && <><label>Confirm password<input type={showPassword?'text':'password'} name="confirmPassword" autoComplete="new-password" minLength={8} required/></label><div className="password-hint">At least 8 characters, including uppercase and lowercase letters, a number and a symbol.</div></>}
          {authMode==='signup' && <><label className="consent"><input type="checkbox" name="termsAccepted" required/><span>I agree to the <a href="/terms.html" target="_blank" rel="noreferrer">Terms and Conditions</a>.</span></label><label className="consent"><input type="checkbox" name="privacyAccepted" required/><span>I have read the <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label></>}
          {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="preview-notice" role="status">{message}</p>}
          <button className="button button-primary form-submit" disabled={busy}>{busy?'Please wait…':authMode==='signup'?'Create account':authMode==='signin'?'Sign in':authMode==='reset'?'Send reset link':'Update password'} <ArrowRight size={16}/></button>
        </form>
        {verificationEmail && authMode==='signin' && <button className="footer-login" onClick={()=>void resendVerification()} disabled={busy}>Resend verification email</button>}
        {authMode==='signin'&&<button className="footer-login" onClick={()=>{setAuthMode('reset');setError('');setMessage('')}}>Forgot password?</button>}
        {authMode==='reset'&&<button className="footer-login" onClick={()=>setAuthMode('signin')}>Back to sign in</button>}
        {authMode==='update'&&<button className="footer-login" onClick={()=>setAuthMode('signin')}>Back to sign in</button>}
      </>}
    </section>
  </div>
}
