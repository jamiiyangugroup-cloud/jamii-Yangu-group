import { FormEvent, useCallback, useEffect, useState } from 'react'
import { BadgeCheck, CircleDollarSign, FileCheck2, RefreshCw, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Report = {
  report_id: string; region_id: string; region_name?: string; period_start: string; period_end: string
  verified_recorded_total_kes: number; provider_reported_total_kes: number | null; unmatched_count: number
  duplicate_count: number; provider_reference: string | null; notes: string; status: string
  submitted_email?: string; submitted_at: string; review_note?: string | null
}
const money = (value: number | null) => value == null ? 'Not provided' : `KES ${Number(value).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export default function FinanceReconciliation({ roleKey, regionId, regionName }: { roleKey: string; regionId: string | null; regionName: string | null }) {
  const isGeneral = roleKey === 'SUPER_FINANCE'
  const [reports, setReports] = useState<Report[]>([])
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [providerTotal, setProviderTotal] = useState('')
  const [unmatched, setUnmatched] = useState('0')
  const [duplicates, setDuplicates] = useState('0')
  const [providerReference, setProviderReference] = useState('')
  const [notes, setNotes] = useState('')
  const [reviewNotes, setReviewNotes] = useState<Record<string,string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase || (!isGeneral && !regionId)) return
    setBusy(true); setError('')
    const { data, error: listError } = isGeneral
      ? await supabase.rpc('get_finance_reconciliation_queue')
      : await supabase.rpc('get_my_finance_reconciliations',{p_region_id:regionId})
    if (listError) setError(listError.message)
    else setReports((data ?? []) as Report[])
    setBusy(false)
  },[isGeneral,regionId])
  useEffect(()=>{void refresh()},[refresh])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!supabase||!regionId) return
    setBusy(true);setError('');setMessage('')
    const {error:submitError}=await supabase.rpc('submit_finance_reconciliation',{
      p_region_id:regionId,p_period_start:periodStart,p_period_end:periodEnd,
      p_provider_reported_total_kes:providerTotal===''?null:Number(providerTotal),
      p_unmatched_count:Number(unmatched),p_duplicate_count:Number(duplicates),
      p_provider_reference:providerReference.trim()||null,p_notes:notes.trim(),
    })
    if(submitError)setError(submitError.message)
    else{setMessage('Reconciliation submitted to General Finance for review.');setProviderTotal('');setUnmatched('0');setDuplicates('0');setProviderReference('');setNotes('');await refresh()}
    setBusy(false)
  }

  async function review(report:Report,decision:string){
    if(!supabase)return
    setBusy(true);setError('');setMessage('')
    const {error:reviewError}=await supabase.rpc('review_finance_reconciliation',{
      p_report_id:report.report_id,p_decision:decision,p_note:reviewNotes[report.report_id]??'',
    })
    if(reviewError)setError(reviewError.message)
    else{setMessage(`Report ${decision.toLowerCase().replace(/_/g,' ')}.`);await refresh()}
    setBusy(false)
  }

  return <section className="staff-workflow-card staff-finance-workflow">
    <div className="staff-workflow-heading"><span><CircleDollarSign size={19}/></span><div><div className="staff-kicker">FINANCIAL CONTROLS</div><h2>{isGeneral?'Regional reconciliation review':'Submit regional reconciliation'}</h2></div><button className="staff-refresh" onClick={()=>void refresh()} disabled={busy}><RefreshCw size={15}/> Refresh</button></div>
    <p>{isGeneral?'Review reports submitted by regional finance. Reviewing a report does not alter or post underlying transactions.':'Compare verified records for your assigned region with your supporting provider report and submit any differences for independent review.'}</p>
    {!isGeneral&&<form className="staff-workflow-form staff-inline-form staff-reconciliation-form" onSubmit={submit}>
      <label>Region<input value={regionName??'Assigned region'} readOnly/></label>
      <label>Period start<input type="date" value={periodStart} onChange={(event)=>setPeriodStart(event.target.value)} required/></label>
      <label>Period end<input type="date" value={periodEnd} onChange={(event)=>setPeriodEnd(event.target.value)} required/></label>
      <label>Provider report total (KES), if available<input type="number" min="0" step="0.01" value={providerTotal} onChange={(event)=>setProviderTotal(event.target.value)} placeholder="Optional"/></label>
      <label>Unmatched items<input type="number" min="0" step="1" value={unmatched} onChange={(event)=>setUnmatched(event.target.value)} required/></label>
      <label>Possible duplicates<input type="number" min="0" step="1" value={duplicates} onChange={(event)=>setDuplicates(event.target.value)} required/></label>
      <label>Provider report reference<input value={providerReference} onChange={(event)=>setProviderReference(event.target.value)} maxLength={160}/></label>
      <label className="staff-reconciliation-notes">Reconciliation notes<textarea value={notes} onChange={(event)=>setNotes(event.target.value)} minLength={10} maxLength={2000} rows={3} required/></label>
      {error&&<p className="staff-error" role="alert">{error}</p>}{message&&<p className="staff-success" role="status">{message}</p>}
      <button className="staff-primary" disabled={busy||!periodStart||!periodEnd}>{busy?'Submitting…':'Submit for General Finance review'}<Send size={15}/></button>
    </form>}
    {isGeneral&&(error||message)&&<p className={error?'staff-error':'staff-success'} role={error?'alert':'status'}>{error||message}</p>}
    <div className="staff-reconciliation-list">{reports.map((report)=><article className="staff-reconciliation-card" key={report.report_id}>
      <div className="staff-application-heading"><div><strong>{report.region_name??regionName??'Assigned region'}</strong><small>{report.period_start} to {report.period_end} · Submitted {new Date(report.submitted_at).toLocaleDateString('en-KE')}</small>{report.submitted_email&&<small>By {report.submitted_email}</small>}</div><span className={`staff-request-status status-${report.status.toLowerCase()}`}>{report.status.replace(/_/g,' ')}</span></div>
      <div className="staff-finance-values"><span>Verified records <strong>{money(report.verified_recorded_total_kes)}</strong></span><span>Provider report <strong>{money(report.provider_reported_total_kes)}</strong></span><span>Unmatched <strong>{report.unmatched_count}</strong></span><span>Possible duplicates <strong>{report.duplicate_count}</strong></span></div>
      {report.provider_reference&&<small>Provider reference: {report.provider_reference}</small>}<p className="staff-reconciliation-notes-copy">{report.notes}</p>{report.review_note&&<p className="staff-review-note">Review note: {report.review_note}</p>}
      {isGeneral&&['SUBMITTED','CLARIFICATION_REQUIRED'].includes(report.status)&&<><label className="staff-decision-note">Review note<input value={reviewNotes[report.report_id]??''} onChange={(event)=>setReviewNotes((current)=>({...current,[report.report_id]:event.target.value}))} maxLength={2000}/></label><div className="staff-row-actions"><button className="staff-primary" onClick={()=>void review(report,'ACCEPTED')} disabled={busy}><BadgeCheck size={15}/> Accept report</button><button className="staff-secondary" onClick={()=>void review(report,'CLARIFICATION_REQUIRED')} disabled={busy}>Request clarification</button><button className="staff-secondary" onClick={()=>void review(report,'REJECTED')} disabled={busy}>Reject report</button></div></>}
    </article>)}{!busy&&!reports.length&&!error&&<div className="staff-empty"><FileCheck2/><h2>No reconciliation reports</h2><p>{isGeneral?'Submitted regional reports will appear here.':'Your submitted reports will appear here.'}</p></div>}</div>
    <div className="staff-security-note"><ShieldCheckIcon/><span>Verified totals are calculated from database records. Provider totals are submitted as supporting evidence and are not treated as verified by this form. No transaction is posted or changed here.</span></div>
  </section>
}

function ShieldCheckIcon(){return <BadgeCheck size={17}/>}
