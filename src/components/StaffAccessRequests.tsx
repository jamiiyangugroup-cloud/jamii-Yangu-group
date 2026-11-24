import { FormEvent, useEffect, useState } from 'react'
import { ArrowRight, Building2, CircleDollarSign, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Region = { id: string; name: string }
type AccessRequest = { request_id: string; requested_role: string; region_name: string | null; status: string; reason: string; requested_at: string; decision_note: string | null }

const roleNames: Record<string,string> = { REGIONAL_ADMIN: 'Regional Admin', MEMBERSHIP_OFFICER: 'Membership Officer', SUPER_FINANCE: 'General Finance', REGIONAL_FINANCE: 'Regional Finance' }

export default function StaffAccessRequests() {
  const [regions, setRegions] = useState<Region[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [role, setRole] = useState('REGIONAL_FINANCE')
  const [regionId, setRegionId] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    if (!supabase) return
    const [regionResult, requestResult] = await Promise.all([
      supabase.from('regions').select('id,name').eq('active', true).order('name'),
      supabase.rpc('get_my_staff_access_requests'),
    ])
    if (!regionResult.error) setRegions((regionResult.data ?? []) as Region[])
    if (!requestResult.error) setRequests((requestResult.data ?? []) as AccessRequest[])
  }

  useEffect(() => { void refresh() }, [])
  const regional = role === 'REGIONAL_ADMIN' || role === 'REGIONAL_FINANCE' || (role === 'MEMBERSHIP_OFFICER' && Boolean(regionId))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    const { error: requestError } = await supabase.rpc('request_staff_access', {
      p_role_key: role, p_region_id: regional ? regionId || null : null, p_reason: reason.trim(),
    })
    if (requestError) setError(requestError.message)
    else { setMessage('Your request was sent to the Super Admin for review.'); setReason(''); await refresh() }
    setBusy(false)
  }

  return <section className="staff-workflow-card">
    <div className="staff-workflow-heading"><span><ShieldCheck size={19}/></span><div><div className="staff-kicker">STAFF ACCESS</div><h2>Request a staff portal</h2></div></div>
    <p>Each assignment is reviewed centrally and limited to its approved role and region. Staff access requires verified email and authenticator MFA.</p>
    <form className="staff-workflow-form" onSubmit={submit}>
      <label>Portal role<select value={role} onChange={(event) => setRole(event.target.value)}>
        <option value="REGIONAL_ADMIN">Regional Admin</option><option value="MEMBERSHIP_OFFICER">Membership Officer</option>
        <option value="SUPER_FINANCE">General Finance</option><option value="REGIONAL_FINANCE">Regional Finance</option>
      </select></label>
      {regional && <label>Assigned region<select value={regionId} onChange={(event) => setRegionId(event.target.value)} required>
        <option value="">Select a region</option>{regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>{!regions.length && <small>No active regions are configured yet. The Super Admin must add them first.</small>}</label>}
      {role === 'MEMBERSHIP_OFFICER' && <label>Scope<select value={regionId ? 'REGION' : 'GLOBAL'} onChange={(event) => setRegionId(event.target.value === 'GLOBAL' ? '' : (regions[0]?.id ?? ''))}><option value="GLOBAL">Organization wide</option><option value="REGION">One region</option></select></label>}
      <label>Reason for access<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} rows={3} required/></label>
      {error && <p className="staff-error" role="alert">{error}</p>}{message && <p className="staff-success" role="status">{message}</p>}
      <button className="staff-primary" disabled={busy || (regional && !regions.length) || (regional && !regionId)}>{busy ? 'Sending request…' : 'Send for approval'}<ArrowRight size={16}/></button>
    </form>
    <div className="staff-request-list"><h3>Your requests</h3>{requests.length ? requests.map((item) => <article key={item.request_id}>
      <div><strong>{roleNames[item.requested_role] ?? item.requested_role}</strong><small>{item.region_name ?? 'Organization wide'} · {new Date(item.requested_at).toLocaleDateString('en-KE')}</small>{item.decision_note && <small>{item.decision_note}</small>}</div>
      <span className={`staff-request-status status-${item.status.toLowerCase()}`}>{item.status.replace(/_/g,' ')}</span>
    </article>) : <p>No staff access requests yet.</p>}</div>
    <div className="staff-security-note"><CircleDollarSign size={16}/><span>General Finance is a separate organization-wide role. Regional Finance is restricted to one active region.</span><Building2 size={16}/></div>
  </section>
}
