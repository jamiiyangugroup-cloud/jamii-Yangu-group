import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Check, CircleDollarSign, MapPin, RefreshCw, ShieldCheck, UserRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Region = { id: string; code: string; name: string; active: boolean; counties: County[]; county_count?: number }
type County = { id: string; code: string; name: string; active: boolean; sub_counties: SubCounty[] }
type SubCounty = { id: string; code: string; name: string; active: boolean }
type Request = { request_id: string; requester_id: string; email_address: string; display_name: string; requested_role: string; region_id: string | null; region_name: string | null; reason: string; requested_at: string }
type StaffRecord = { user_id: string; email_address: string; display_name: string; account_status: string; role_key: string; region_id: string | null; region_name: string | null; assignment_active: boolean }
type Dashboard = { registered_accounts: number; active_members: number; pending_applications: number; active_regions: number; pending_staff_requests: number; open_support_cases: number }
type AuditRow={audit_id:string;actor_email:string|null;action_key:string;resource_type:string;resource_id:string|null;details:Record<string,unknown>;created_at:string}

const roleNames: Record<string,string> = { SUPER_ADMIN: 'Super Admin', REGIONAL_ADMIN: 'Regional Admin', MEMBERSHIP_OFFICER: 'Membership Officer', SUPER_FINANCE: 'General Finance', REGIONAL_FINANCE: 'Regional Finance' }
const emptyDashboard: Dashboard = { registered_accounts: 0, active_members: 0, pending_applications: 0, active_regions: 0, pending_staff_requests: 0, open_support_cases: 0 }

export default function SuperAdminControls() {
  const [regions, setRegions] = useState<Region[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [auditRows,setAuditRows]=useState<AuditRow[]>([])
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard)
  const [membershipApprovalRole,setMembershipApprovalRole]=useState('')
  const [policy,setPolicy]=useState({registration_fee_kes:'500',monthly_contribution_kes:'300',loan_minimum_savings_kes:'2000',loan_minimum_membership_months:'2'})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [regionCode, setRegionCode] = useState('')
  const [regionName, setRegionName] = useState('')
  const [countyRegion, setCountyRegion] = useState('')
  const [countyCode, setCountyCode] = useState('')
  const [countyName, setCountyName] = useState('')
  const [subCountyId, setSubCountyId] = useState('')
  const [subCountyCode, setSubCountyCode] = useState('')
  const [subCountyName, setSubCountyName] = useState('')
  const [notes, setNotes] = useState<Record<string,string>>({})

  const counties = useMemo(() => regions.flatMap((region) => region.counties.map((county) => ({ ...county, regionName: region.name }))), [regions])

  const refresh = useCallback(async () => {
    if (!supabase) return
    setBusy(true); setError('')
    const [summary, regionResult, treeResult, requestResult, staffResult, approvalRoleResult,auditResult,policyResult] = await Promise.all([
      supabase.rpc('get_super_admin_dashboard'), supabase.rpc('get_admin_regions'), supabase.rpc('get_admin_location_tree'),
      supabase.rpc('get_pending_staff_access_requests'), supabase.rpc('get_staff_directory'),supabase.rpc('get_membership_final_approval_role'),supabase.rpc('get_recent_admin_audit',{p_limit:100}),supabase.rpc('get_cooperative_policy_settings'),
    ])
    const failed = [summary, regionResult, treeResult, requestResult, staffResult,approvalRoleResult,auditResult,policyResult].find((result) => result.error)
    if (failed?.error) setError(failed.error.message)
    else {
      setDashboard((summary.data ?? emptyDashboard) as Dashboard)
      const rawRegions = (regionResult.data ?? []) as { region_id: string; code: string; name: string; active: boolean; county_count: number }[]
      const tree = (treeResult.data ?? []) as Region[]
      setRegions(rawRegions.map((region) => ({ id: region.region_id, ...region, counties: tree.find((item) => item.id === region.region_id)?.counties ?? [] })))
      setRequests((requestResult.data ?? []) as Request[])
      setStaff((staffResult.data ?? []) as StaffRecord[])
      setMembershipApprovalRole((approvalRoleResult.data as string|null)??'')
      setAuditRows((auditResult.data??[]) as AuditRow[])
      const configured=(policyResult.data??{}) as Record<string,number|string>
      setPolicy({registration_fee_kes:String(configured.registration_fee_kes??''),monthly_contribution_kes:String(configured.monthly_contribution_kes??''),loan_minimum_savings_kes:String(configured.loan_minimum_savings_kes??''),loan_minimum_membership_months:String(configured.loan_minimum_membership_months??'')})
      setCountyRegion((current) => current || rawRegions.find((item) => item.active)?.region_id || '')
    }
    setBusy(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function submit(event: FormEvent<HTMLFormElement>, action: string, args: Record<string,unknown>, done: () => void) {
    event.preventDefault(); if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    const { error: rpcError } = await supabase.rpc(action, args)
    if (rpcError) setError(rpcError.message)
    else { setMessage('Saved. The change was recorded in the audit log.'); done(); await refresh() }
    setBusy(false)
  }

  async function reviewRequest(request: Request, approve: boolean) {
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    const { error: rpcError } = await supabase.rpc('review_staff_access_request', {
      p_request_id: request.request_id, p_approve: approve, p_note: notes[request.request_id] ?? '',
    })
    if (rpcError) setError(rpcError.message)
    else { setMessage(`${roleNames[request.requested_role] ?? request.requested_role} request ${approve ? 'approved' : 'rejected'}.`); await refresh() }
    setBusy(false)
  }

  async function setStatus(record: StaffRecord) {
    if (!supabase) return
    const status = record.account_status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('set_staff_account_status', { p_user_id: record.user_id, p_status: status })
    if (rpcError) setError(rpcError.message)
    else { setMessage(`Staff account ${status.toLowerCase()}.`); await refresh() }
    setBusy(false)
  }

  async function setAssignment(record: StaffRecord) {
    if (!supabase) return
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('set_staff_assignment_active', {
      p_user_id: record.user_id, p_role_key: record.role_key, p_region_id: record.region_id, p_active: !record.assignment_active,
    })
    if (rpcError) setError(rpcError.message)
    else { setMessage(`Staff assignment ${record.assignment_active?'revoked':'reactivated'}.`); await refresh() }
    setBusy(false)
  }

  async function saveMembershipApprovalRole(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase)return
    setBusy(true);setError('');setMessage('')
    const {error:settingError}=await supabase.rpc('set_membership_final_approval_role',{p_role_key:membershipApprovalRole||null})
    if(settingError)setError(settingError.message)
    else{setMessage(membershipApprovalRole?`Final membership approval assigned to ${roleNames[membershipApprovalRole]??membershipApprovalRole}.`:'Final membership approval remains disabled until management configures a role.');await refresh()}
    setBusy(false)
  }

  async function saveCooperativePolicy(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase)return
    setBusy(true);setError('');setMessage('')
    const {error:settingError}=await supabase.rpc('set_cooperative_policy_settings',{
      p_registration_fee_kes:Number(policy.registration_fee_kes),
      p_monthly_contribution_kes:Number(policy.monthly_contribution_kes),
      p_loan_minimum_savings_kes:Number(policy.loan_minimum_savings_kes),
      p_loan_minimum_membership_months:Number(policy.loan_minimum_membership_months),
    })
    if(settingError)setError(settingError.message)
    else{setMessage('Cooperative financial policy saved and added to the audit log.');await refresh()}
    setBusy(false)
  }

  return <div className="staff-governance">
    <section className="staff-governance-summary"><div className="staff-governance-heading"><div><div className="staff-kicker">ORGANIZATION MANAGEMENT</div><h2>Administration</h2></div><button className="staff-refresh" onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/> Refresh</button></div>
      <div className="staff-governance-metrics">{[
        ['Approved members',dashboard.active_members],['Pending applications',dashboard.pending_applications],['Active regions',dashboard.active_regions],['Staff requests',dashboard.pending_staff_requests],
      ].map(([label,value])=><article key={String(label)}><small>{label}</small><strong>{Number(value).toLocaleString('en-KE')}</strong></article>)}</div>
    </section>
    {error && <p className="staff-error" role="alert">{error}</p>}{message && <p className="staff-success" role="status">{message}</p>}
    <section className="staff-control-section"><div className="staff-control-title"><CircleDollarSign size={18}/><div><h2>Cooperative financial policy</h2><p>Initial values are editable. Interest rates, loan caps, penalties and approval limits stay unset until management configures them.</p></div></div><form className="staff-workflow-form staff-inline-form" onSubmit={saveCooperativePolicy}><label>One-time registration fee (KES)<input type="number" min="0.01" max="10000000" step="0.01" value={policy.registration_fee_kes} onChange={(event)=>setPolicy({...policy,registration_fee_kes:event.target.value})} required/></label><label>Monthly contribution (KES)<input type="number" min="0.01" max="10000000" step="0.01" value={policy.monthly_contribution_kes} onChange={(event)=>setPolicy({...policy,monthly_contribution_kes:event.target.value})} required/></label><label>Minimum savings for loan request (KES)<input type="number" min="0" max="1000000000" step="0.01" value={policy.loan_minimum_savings_kes} onChange={(event)=>setPolicy({...policy,loan_minimum_savings_kes:event.target.value})} required/></label><label>Minimum membership period (months)<input type="number" min="0" max="120" step="1" value={policy.loan_minimum_membership_months} onChange={(event)=>setPolicy({...policy,loan_minimum_membership_months:event.target.value})} required/></label><button className="staff-primary" disabled={busy}>Save financial policy</button></form></section>

    <section className="staff-control-section"><div className="staff-control-title"><ShieldCheck size={18}/><div><h2>Membership approval policy</h2><p>Final membership decisions stay disabled until management selects an approved role. This setting does not set or change any financial authorization policy.</p></div></div><form className="staff-workflow-form staff-inline-form staff-policy-form" onSubmit={saveMembershipApprovalRole}><label>Final membership approver role<select value={membershipApprovalRole} onChange={(event)=>setMembershipApprovalRole(event.target.value)}><option value="">Not configured — final decisions disabled</option><option value="MEMBERSHIP_OFFICER">Membership Officer</option><option value="REGIONAL_ADMIN">Regional Admin</option><option value="SUPER_ADMIN">Super Admin</option></select></label><button className="staff-primary" disabled={busy}>Save approval policy</button></form></section>

    <section className="staff-control-section"><div className="staff-control-title"><MapPin size={18}/><div><h2>Regions and jurisdictions</h2><p>Regions are configured by cooperative management. Counties and sub-counties must be assigned to a region before membership applications can be routed.</p></div></div>
      <form className="staff-workflow-form staff-inline-form" onSubmit={(event)=>void submit(event,'create_region',{p_code:regionCode,p_name:regionName},()=>{setRegionCode('');setRegionName('')})}>
        <label>Region code<input value={regionCode} onChange={(event)=>setRegionCode(event.target.value)} maxLength={16} required/></label><label>Region name<input value={regionName} onChange={(event)=>setRegionName(event.target.value)} maxLength={100} required/></label><button className="staff-primary" disabled={busy}>Add region</button>
      </form>
      <form className="staff-workflow-form staff-inline-form" onSubmit={(event)=>void submit(event,'create_county',{p_region_id:countyRegion,p_code:countyCode,p_name:countyName},()=>{setCountyCode('');setCountyName('')})}>
        <label>County region<select value={countyRegion} onChange={(event)=>setCountyRegion(event.target.value)} required><option value="">Select region</option>{regions.filter((region)=>region.active).map((region)=><option key={region.id} value={region.id}>{region.name}</option>)}</select></label><label>County code<input value={countyCode} onChange={(event)=>setCountyCode(event.target.value)} maxLength={16} required/></label><label>County name<input value={countyName} onChange={(event)=>setCountyName(event.target.value)} maxLength={100} required/></label><button className="staff-primary" disabled={busy || !regions.some((region)=>region.active)}>Add county</button>
      </form>
      <form className="staff-workflow-form staff-inline-form" onSubmit={(event)=>void submit(event,'create_sub_county',{p_county_id:subCountyId,p_code:subCountyCode,p_name:subCountyName},()=>{setSubCountyCode('');setSubCountyName('')})}>
        <label>County<select value={subCountyId} onChange={(event)=>setSubCountyId(event.target.value)} required><option value="">Select county</option>{counties.filter((county)=>county.active).map((county)=><option key={county.id} value={county.id}>{county.name} · {county.regionName}</option>)}</select></label><label>Sub-county code<input value={subCountyCode} onChange={(event)=>setSubCountyCode(event.target.value)} maxLength={16} required/></label><label>Sub-county name<input value={subCountyName} onChange={(event)=>setSubCountyName(event.target.value)} maxLength={100} required/></label><button className="staff-primary" disabled={busy || !counties.some((county)=>county.active)}>Add sub-county</button>
      </form>
      <div className="staff-region-list">{regions.map((region)=><article key={region.id} className="staff-region-card"><div><strong>{region.name}</strong><small>{region.code} · {region.county_count ?? region.counties.length} counties · {region.active?'Active':'Inactive'}</small>{region.counties.map((county)=><span className="staff-region-child" key={county.id}>{county.name} <small>{county.sub_counties.length} sub-counties</small></span>)}</div><button className="staff-secondary" onClick={()=>void submit(new Event('submit') as unknown as FormEvent<HTMLFormElement>,'set_region_active',{p_region_id:region.id,p_active:!region.active},()=>{})} disabled={busy}>{region.active?'Deactivate':'Activate'}</button></article>)}{!regions.length&&<p className="staff-empty-copy">No regions are configured yet.</p>}</div>
    </section>

    <section className="staff-control-section"><div className="staff-control-title"><ShieldCheck size={18}/><div><h2>Staff role approvals</h2><p>Approving a request activates only the requested role and scope. Finance roles are kept separate from Super Admin authority.</p></div></div>
      {requests.length?requests.map((request)=><article className="staff-approval-card" key={request.request_id}><div className="staff-approval-person"><span><UserRound size={17}/></span><div><strong>{request.display_name||request.email_address}</strong><small>{request.email_address} · {roleNames[request.requested_role]??request.requested_role} · {request.region_name??'Organization wide'}</small><p>{request.reason}</p></div></div><label>Decision note<input value={notes[request.request_id]??''} onChange={(event)=>setNotes((current)=>({...current,[request.request_id]:event.target.value}))} maxLength={500}/></label><div className="staff-row-actions"><button className="staff-primary" onClick={()=>void reviewRequest(request,true)} disabled={busy}><Check size={15}/> Approve</button><button className="staff-secondary" onClick={()=>void reviewRequest(request,false)} disabled={busy}><X size={15}/> Reject</button></div></article>):<p className="staff-empty-copy">No staff access requests are waiting for review.</p>}
    </section>

    <section className="staff-control-section"><div className="staff-control-title"><Building2 size={18}/><div><h2>Authorized staff accounts</h2><p>Suspension immediately blocks privileged workspace access while preserving the audit history.</p></div></div>
      <div className="staff-directory-list">{staff.map((record)=><article key={`${record.user_id}-${record.role_key}-${record.region_id??'global'}`}><div><strong>{record.display_name||record.email_address}</strong><small>{record.email_address} · {roleNames[record.role_key]??record.role_key} · {record.region_name??'Organization wide'}</small><small>Account {record.account_status.toLowerCase()} · assignment {record.assignment_active?'active':'inactive'}</small></div><div className="staff-row-actions"><button className="staff-secondary" onClick={()=>void setAssignment(record)} disabled={busy}>{record.assignment_active?'Revoke assignment':'Reactivate assignment'}</button><button className="staff-secondary" onClick={()=>void setStatus(record)} disabled={busy || record.account_status==='CLOSED'}>{record.account_status==='SUSPENDED'?'Reactivate account':'Suspend account'}</button></div></article>)}{!staff.length&&<p className="staff-empty-copy">No staff assignments are configured.</p>}</div>
    </section>
    <section className="staff-control-section"><div className="staff-control-title"><ShieldCheck size={18}/><div><h2>Recent administrative audit</h2><p>Latest security and organization changes are append-only and show the acting account.</p></div></div><div className="staff-audit-list">{auditRows.map((item)=><article key={item.audit_id}><div><strong>{item.action_key.replace(/[._]/g,' ')}</strong><small>{item.actor_email??'System'} · {item.resource_type}{item.resource_id?` · ${item.resource_id}`:''}</small></div><time>{new Date(item.created_at).toLocaleString('en-KE')}</time></article>)}{!auditRows.length&&<p className="staff-empty-copy">No audit events recorded yet.</p>}</div></section>
    <div className="staff-security-note"><CircleDollarSign size={17}/><span>Super Admin controls portal assignment and organization settings. Financial approvals remain subject to separate approval rules, audit controls and separation of duties.</span></div>
  </div>
}
