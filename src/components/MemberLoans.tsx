import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CircleDollarSign, FileText, HandCoins, Heart, RefreshCw, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Eligibility={eligible:boolean;reasons:string[];savings_balance_kes:number;minimum_savings_kes:number|null;membership_months:number;minimum_membership_months:number|null;active_loan_count:number;next_of_kin_on_file:boolean}
type LoanApplication={id:string;amount_requested_kes:number;purpose:string;repayment_months:number;status:string;requested_at:string}
type Loan={id:string;principal_kes:number;status:string;created_at:string}
type Assistance={id:string;assistance_type:string;amount_requested_kes:number;status:string;created_at:string}
const cash=(amount:number)=>`KSh ${Number(amount||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export default function MemberLoans({session,memberId}:{session:Session;memberId:string|null}){
  const[eligibility,setEligibility]=useState<Eligibility|null>(null)
  const[applications,setApplications]=useState<LoanApplication[]>([])
  const[loans,setLoans]=useState<Loan[]>([])
  const[assistance,setAssistance]=useState<Assistance[]>([])
  const[busy,setBusy]=useState(false)
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[message,setMessage]=useState('')
  const load=useCallback(async()=>{
    if(!supabase){setLoading(false);return}
    setLoading(true);setError('')
    const [eligibilityResult,applicationResult,loanResult,assistanceResult]=await Promise.all([
      supabase.rpc('get_my_loan_eligibility'),
      memberId?supabase.from('loan_applications').select('id,amount_requested_kes,purpose,repayment_months,status,requested_at').eq('member_id',memberId).order('requested_at',{ascending:false}):Promise.resolve({data:[],error:null}),
      memberId?supabase.from('loans').select('id,principal_kes,status,created_at').eq('member_id',memberId).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null}),
      memberId?supabase.from('financial_assistance_applications').select('id,assistance_type,amount_requested_kes,status,created_at').eq('member_id',memberId).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null}),
    ])
    if(eligibilityResult.error)setError('Loan eligibility information is unavailable. Refresh or contact member support.')
    else setEligibility(eligibilityResult.data as Eligibility)
    if(applicationResult.error||loanResult.error||assistanceResult.error)setError('Some loan or assistance records could not be loaded.')
    setApplications((applicationResult.data??[]) as LoanApplication[])
    setLoans((loanResult.data??[]) as Loan[])
    setAssistance((assistanceResult.data??[]) as Assistance[])
    setLoading(false)
  },[memberId])
  useEffect(()=>{void load()},[load])

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase)return
    const formElement=event.currentTarget
    const form=new FormData(formElement);setBusy(true);setError('');setMessage('')
    const {error:submitError}=await supabase.rpc('submit_member_loan_application',{
      p_amount_requested_kes:Number(form.get('amount')),
      p_purpose:String(form.get('purpose')).trim(),
      p_repayment_months:Number(form.get('repayment_months')),
      p_income_source:String(form.get('income_source')).trim(),
      p_next_of_kin_name:String(form.get('next_of_kin_name')).trim(),
      p_next_of_kin_phone:String(form.get('next_of_kin_phone')).trim(),
    })
    setBusy(false)
    if(submitError){setError(submitError.message.includes('eligibility')?'Your account does not currently meet the published loan requirements. Review the eligibility details below.':'The application could not be submitted. Check each field and try again.');return}
    formElement.reset();setMessage('Loan application submitted for review. Requested terms are not an offer or approval.');await load()
  }

  return <div className="member-module-grid">
    <section className="member-section-card"><div className="member-section-heading"><div><span><ShieldCheck size={18}/></span><h2>Loan eligibility</h2></div><button className="member-text-action" onClick={()=>void load()} disabled={loading||busy}><RefreshCw size={14}/> Refresh</button></div>
      {loading?<p className="member-section-intro">Checking your member record and verified savings…</p>:eligibility?<><div className="member-finance-summary"><div><small>Recorded savings balance</small><strong>{cash(eligibility.savings_balance_kes)}</strong></div><div><small>Membership length</small><strong>{eligibility.membership_months} months</strong></div><div><small>Current loan status</small><strong>{eligibility.active_loan_count?'Outstanding loan':'No outstanding loan'}</strong></div></div><p className="member-section-intro">Current minimum: {eligibility.minimum_savings_kes===null?'Not configured':cash(eligibility.minimum_savings_kes)} in savings and {eligibility.minimum_membership_months??'an unconfigured number of'} months of active membership. Eligibility is checked again when you submit.</p>{eligibility.reasons.length>0&&<ul className="member-eligibility-reasons">{eligibility.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}{eligibility.eligible&&<p className="member-success">You meet the current application checks. Finance and authorized officers still review every request.</p>}</>:<p className="member-section-intro">Eligibility could not be calculated.</p>}
    </section>
    <section className="member-section-card"><div className="member-section-heading"><div><span><HandCoins size={18}/></span><h2>Apply for a loan</h2></div></div><p className="member-section-intro">This is a request only. The cooperative has not configured interest, maximum amounts, fees or approved repayment terms. Do not treat a submitted request as approved.</p>{(error||message)&&<p className={error?'member-error':'member-success'} role={error?'alert':'status'}>{error||message}</p>}
      {eligibility?.eligible?<form className="member-profile-form" onSubmit={event=>void submit(event)}><label>Amount requested (KES)<input name="amount" type="number" min="1" step="0.01" max="1000000000" required/></label><label>Purpose<textarea name="purpose" minLength={5} maxLength={1000} required/></label><label>Requested repayment period (months)<input name="repayment_months" type="number" min="1" max="120" step="1" required/><small>Requested only; final terms require cooperative approval.</small></label><label>Income source<input name="income_source" maxLength={160} required/></label><label>Next of kin name<input name="next_of_kin_name" defaultValue={session.user.user_metadata?.next_of_kin_name??''} minLength={2} maxLength={160} required/></label><label>Next of kin phone<input name="next_of_kin_phone" type="tel" pattern="[+]?[0-9 ()-]{9,20}" defaultValue={session.user.user_metadata?.next_of_kin_phone??''} required/></label><button className="member-primary" disabled={busy}>{busy?'Submitting…':'Submit loan request'}</button></form>:<p className="member-empty-state">Meet the requirements above before submitting a loan request.</p>}
    </section>
    <section className="member-section-card"><div className="member-section-heading"><div><span><FileText size={18}/></span><h2>My loan applications</h2></div></div>{applications.length?applications.map(app=><article className="member-record-row" key={app.id}><div><strong>{app.purpose}</strong><small>{cash(app.amount_requested_kes)} · Requested {app.repayment_months} months · {new Date(app.requested_at).toLocaleDateString('en-KE')}</small></div><span className="member-finance-status">{app.status.replace(/_/g,' ')}</span></article>):<p className="member-section-intro">Your requests will appear here after submission.</p>}</section>
    <section className="member-section-card"><div className="member-section-heading"><div><span><CircleDollarSign size={18}/></span><h2>Loan records</h2></div></div>{loans.length?loans.map(loan=><article className="member-record-row" key={loan.id}><div><strong>{cash(loan.principal_kes)}</strong><small>{new Date(loan.created_at).toLocaleDateString('en-KE')}</small></div><span className="member-finance-status">{loan.status.replace(/_/g,' ')}</span></article>):<p className="member-section-intro">No authorized loan records are linked to your account.</p>}<p className="member-section-intro">Repayment schedules are not published in the current database model; balances are not estimated here.</p></section>
    <section className="member-section-card"><div className="member-section-heading"><div><span><Heart size={18}/></span><h2>Financial assistance</h2></div></div>{assistance.length?assistance.map(item=><article className="member-record-row" key={item.id}><div><strong>{item.assistance_type.replace(/_/g,' ')}</strong><small>{cash(item.amount_requested_kes)} · {new Date(item.created_at).toLocaleDateString('en-KE')}</small></div><span className="member-finance-status">{item.status.replace(/_/g,' ')}</span></article>):<p className="member-section-intro">No assistance requests are recorded. New assistance applications are unavailable until an approved programme and eligibility rules are configured.</p>}</section>
  </div>
}
