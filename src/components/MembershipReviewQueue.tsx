import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, ClipboardList, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application = {
  application_id: string; user_id: string; full_legal_name: string; date_of_birth: string; gender: string | null
  phone_number: string; email_address: string; county_name: string; sub_county_name: string; physical_address: string
  occupation: string; next_of_kin_name: string; next_of_kin_phone: string; status: string; payment_status: string
  registration_fee_kes: number | null; created_at: string; region_name: string
}

export default function MembershipReviewQueue({ roleKey }: { roleKey: string }) {
  const [applications, setApplications] = useState<Application[]>([])
  const [finalApprovalRole,setFinalApprovalRole]=useState<string|null>(null)
  const [notes, setNotes] = useState<Record<string,string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase) return
    setBusy(true); setError('')
    const [queueResult,approvalRoleResult]=await Promise.all([
      supabase.rpc('get_membership_review_queue'),supabase.rpc('get_membership_final_approval_role'),
    ])
    if (queueResult.error) setError(queueResult.error.message)
    else setApplications((queueResult.data ?? []) as Application[])
    if(!approvalRoleResult.error)setFinalApprovalRole((approvalRoleResult.data as string|null)??null)
    setBusy(false)
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  async function review(application: Application, action: string) {
    if (!supabase) return
    setBusy(true); setError(''); setMessage('')
    const { error: reviewError } = await supabase.rpc('review_membership_application', {
      p_application_id: application.application_id, p_action: action, p_reason: notes[application.application_id] ?? '',
    })
    if (reviewError) setError(reviewError.message)
    else { setMessage(`Application ${action.toLowerCase().replace(/_/g,' ')}.`); await refresh() }
    setBusy(false)
  }

  const regionalAdmin=roleKey==='REGIONAL_ADMIN'
  const canFinalize=finalApprovalRole===roleKey
  return <section className="staff-workflow-card staff-membership-queue">
    <div className="staff-workflow-heading"><span><ClipboardList size={19}/></span><div><div className="staff-kicker">MEMBERSHIP REVIEW</div><h2>{canFinalize?'Final membership decisions':regionalAdmin?'Regional application review':'Membership application oversight'}</h2></div><button className="staff-refresh" onClick={()=>void refresh()} disabled={busy}><RefreshCw size={15}/> Refresh</button></div>
    <p>{canFinalize ? 'The configured approver may record final membership decisions. Approval requires a verified registration payment.' : regionalAdmin ? 'Review applications in your assigned region, request missing information, or forward complete applications for final approval.' : 'View assigned applications. Final decision authority follows the cooperative approval policy configured by the Super Admin.'}</p>
    {!finalApprovalRole&&<p className="staff-policy-alert">Final membership approval is not configured. The Super Admin must select the authorized role before applications can be approved or rejected.</p>}
    {error&&<p className="staff-error" role="alert">{error}</p>}{message&&<p className="staff-success" role="status">{message}</p>}
    <div className="staff-application-list">{applications.map((application)=><article className="staff-application-review" key={application.application_id}>
      <div className="staff-application-heading"><div><strong>{application.full_legal_name}</strong><small>{application.region_name} · {application.county_name} · {application.sub_county_name}</small></div><span className="staff-request-status">{application.status.replace(/_/g,' ')}</span></div>
      <dl><div><dt>Email</dt><dd>{application.email_address}</dd></div><div><dt>Phone</dt><dd>{application.phone_number}</dd></div><div><dt>Date of birth</dt><dd>{application.date_of_birth}</dd></div><div><dt>Occupation</dt><dd>{application.occupation}</dd></div><div><dt>Address</dt><dd>{application.physical_address}</dd></div><div><dt>Next of kin</dt><dd>{application.next_of_kin_name} · {application.next_of_kin_phone}</dd></div></dl>
      <div className="staff-application-meta"><span>Registration payment: <strong>{application.payment_status.replace(/_/g,' ')}</strong></span><span>Fee on record: <strong>{application.registration_fee_kes==null?'Not configured':`KES ${Number(application.registration_fee_kes).toLocaleString('en-KE')}`}</strong></span><span>Submitted {new Date(application.created_at).toLocaleDateString('en-KE')}</span></div>
      <label className="staff-decision-note">Decision note<textarea value={notes[application.application_id]??''} onChange={(event)=>setNotes((current)=>({...current,[application.application_id]:event.target.value}))} maxLength={500} rows={2} placeholder="Record the review reason or missing information"/></label>
      <div className="staff-row-actions">{regionalAdmin && <>
        {application.status==='SUBMITTED'&&<button className="staff-secondary" onClick={()=>void review(application,'UNDER_REVIEW')} disabled={busy}>Start review</button>}
        <button className="staff-secondary" onClick={()=>void review(application,'MORE_INFORMATION_REQUIRED')} disabled={busy}>Request information</button>
        <button className="staff-primary" onClick={()=>void review(application,'FORWARDED')} disabled={busy}><Send size={15}/> Forward for approval</button>
      </>}{canFinalize&&<>
        <button className="staff-primary" onClick={()=>void review(application,'APPROVED')} disabled={busy||application.payment_status!=='VERIFIED'}><BadgeCheck size={15}/> Approve membership</button>
        <button className="staff-secondary" onClick={()=>void review(application,'REJECTED')} disabled={busy}>Reject</button>
      </>}{!regionalAdmin&&!canFinalize&&<small className="staff-empty-copy">No final decision actions are enabled for this role.</small>}</div>
    </article>)}{!busy&&!applications.length&&!error&&<div className="staff-empty"><ShieldCheck/><h2>No applications in your queue</h2><p>Applications appear here only when assigned to your role and region.</p></div>}</div>
  </section>
}
