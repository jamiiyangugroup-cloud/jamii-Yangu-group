import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, Banknote, Building2, FileText, HeartPulse, RefreshCw, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Need='LOAN'|'RENT'|'MEDICAL'|'SCHOOL_FEES'|'BASIC_NEEDS'
type Eligibility={eligible:boolean;reasons:string[];savings_balance_kes:number;minimum_savings_kes:number|null;membership_months:number;minimum_membership_months:number|null;qualifying_contribution_months?:number;minimum_verified_contribution_months?:number|null;active_loan_count:number;next_of_kin_on_file:boolean}
type LoanApplication={id:string;amount_requested_kes:number;purpose:string;repayment_months:number;status:string;requested_at:string}
type Loan={id:string;principal_kes:number;status:string;created_at:string}
type Assistance={id:string;assistance_type:string;arrangement:string;amount_requested_kes:number;status:string;created_at:string}
type RequestRow={id:string;kind:string;amount:number;label:string;status:string;date:string}
const cash=(amount:number)=>`KSh ${Number(amount||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const needs:{value:Need;label:string;description:string}[]=[
  {value:'LOAN',label:'Loan to me',description:'Request a recoverable loan paid to your M-Pesa or bank details.'},
  {value:'RENT',label:'Rent payment',description:'Request a reviewed payment to your landlord.'},
  {value:'MEDICAL',label:'Medical bill',description:'Request a reviewed payment to a clinic, hospital or pharmacy.'},
  {value:'SCHOOL_FEES',label:'School fees',description:'Request a reviewed payment to a school or college.'},
  {value:'BASIC_NEEDS',label:'Essential bill or urgent need',description:'Electricity, water, cooking gas, food or another essential need.'},
]

export default function MemberLoans({session,memberId,supportEligible=null}:{session:Session;memberId:string|null;supportEligible?:boolean|null}){
  const [eligibility,setEligibility]=useState<Eligibility|null>(null)
  const [eligibilityError,setEligibilityError]=useState('')
  const [applications,setApplications]=useState<LoanApplication[]>([])
  const [loans,setLoans]=useState<Loan[]>([])
  const [assistance,setAssistance]=useState<Assistance[]>([])
  const [need,setNeed]=useState<Need>('LOAN')
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  const load=useCallback(async()=>{
    if(!supabase){setLoading(false);setEligibilityError('Secure member services are unavailable.');return}
    setLoading(true);setError('');setEligibilityError('')
    const [eligibilityResult,applicationResult,loanResult,assistanceResult]=await Promise.all([
      supabase.rpc('get_my_loan_eligibility'),
      memberId?supabase.from('loan_applications').select('id,amount_requested_kes,purpose,repayment_months,status,requested_at').eq('member_id',memberId).order('requested_at',{ascending:false}):Promise.resolve({data:[],error:null}),
      memberId?supabase.from('loans').select('id,principal_kes,status,created_at').eq('member_id',memberId).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null}),
      memberId?supabase.from('financial_assistance_applications').select('id,assistance_type,arrangement,amount_requested_kes,status,created_at').eq('member_id',memberId).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null}),
    ])
    if(eligibilityResult.error){setEligibility(null);setEligibilityError('Loan checks are unavailable right now. Your request cannot be assessed until the cooperative service is restored.')}
    else setEligibility(eligibilityResult.data as Eligibility)
    if(applicationResult.error||loanResult.error||assistanceResult.error)setError('Some of your request history could not be loaded. Refresh or contact member support.')
    setApplications((applicationResult.data??[]) as LoanApplication[])
    setLoans((loanResult.data??[]) as Loan[])
    setAssistance((assistanceResult.data??[]) as Assistance[])
    setLoading(false)
  },[memberId])
  useEffect(()=>{void load()},[load])

  const requestRows=useMemo<RequestRow[]>(()=>[
    ...applications.map(item=>({id:`loan-${item.id}`,kind:'LOAN',amount:item.amount_requested_kes,label:item.purpose,status:item.status,date:item.requested_at})),
    ...assistance.map(item=>({id:`help-${item.id}`,kind:item.assistance_type,amount:item.amount_requested_kes,label:`${item.assistance_type.replace(/_/g,' ')} · ${item.arrangement==='DIRECT_BILL_PAYMENT'?'Pay provider':'Support request'}`,status:item.status,date:item.created_at})),
    ...loans.map(item=>({id:`record-${item.id}`,kind:'LOAN',amount:item.principal_kes,label:'Authorized loan',status:item.status,date:item.created_at})),
  ].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()),[applications,assistance,loans])

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase)return
    if(need==='LOAN'&&!eligibility?.eligible){setError(eligibilityError||'Your loan eligibility checks are not complete.');return}
    if(need!=='LOAN'&&supportEligible!==true){setError(supportEligible===false?'Your verified member record does not currently meet the support programme checks.':'Support programme eligibility is not configured. Please contact member support.');return}
    const formElement=event.currentTarget,form=new FormData(formElement)
    const values=(key:string)=>String(form.get(key)??'').trim()
    const details={
      service_category:need==='BASIC_NEEDS'?values('service_category'):null,
      patient_name:need==='MEDICAL'?values('patient_name'):null,
      student_name:need==='SCHOOL_FEES'?values('student_name'):null,
      institution_name:need==='SCHOOL_FEES'?values('institution_name'):null,
      admission_number:need==='SCHOOL_FEES'?values('admission_number'):null,
    }
    setBusy(true);setError('');setMessage('')
    const {error:submitError}=await supabase.rpc('submit_member_support_request',{
      p_request_kind:need==='LOAN'?'LOAN':'ASSISTANCE',
      p_support_type:need==='LOAN'?values('loan_purpose'):need,
      p_arrangement:need==='LOAN'?'RECOVERABLE_LOAN':'DIRECT_BILL_PAYMENT',
      p_amount_requested_kes:Number(values('amount')),
      p_reason:values('reason'),
      p_repayment_months:need==='LOAN'?Number(values('repayment_months')):null,
      p_income_source:need==='LOAN'?values('income_source'):null,
      p_next_of_kin_name:need==='LOAN'?values('next_of_kin_name'):null,
      p_next_of_kin_phone:need==='LOAN'?values('next_of_kin_phone'):null,
      p_payout_method:need==='LOAN'?values('payout_method'):null,
      p_payout_destination:need==='LOAN'?values('payout_destination'):null,
      p_recipient_name:need==='RENT'?values('landlord_name'):need==='MEDICAL'?values('provider_name'):need==='SCHOOL_FEES'?values('institution_name'):values('supplier_name'),
      p_recipient_phone:need==='RENT'?values('landlord_phone'):need==='MEDICAL'?values('provider_phone'):values('recipient_phone'),
      p_payment_details:need==='LOAN'?null:values('payment_details'),
      p_location:need==='RENT'?values('property_location'):values('location'),
      p_due_date:values('due_date')||null,
      p_extra:details,
    })
    setBusy(false)
    if(submitError){setError(submitError.message.includes('eligibility')?'The cooperative checks did not approve this request for submission. Review eligibility or contact member support.':'We could not submit your request. The secure support service may need to be enabled; please try again or contact member support.');return}
    formElement.reset();setNeed('LOAN');setMessage('Your request was submitted for cooperative review. This is not an approval or a payment confirmation.');await load()
  }

  const selectedNeed=needs.find(item=>item.value===need)!
  return <div className="member-support-page">
    <section className="member-section-card member-support-eligibility"><div className="member-section-heading"><div><span><ShieldCheck size={18}/></span><h2>Your eligibility</h2></div><button className="member-text-action" onClick={()=>void load()} disabled={loading||busy}><RefreshCw size={14}/> Refresh</button></div>
      {loading?<p className="member-section-intro">Checking your verified member record…</p>:eligibility?<><div className="member-finance-summary"><div><small>Verified savings</small><strong>{cash(eligibility.savings_balance_kes)}</strong></div><div><small>Membership</small><strong>{eligibility.membership_months} months</strong></div><div><small>Verified contribution months</small><strong>{eligibility.qualifying_contribution_months??'Not checked'}</strong></div></div>{eligibility.reasons.length>0&&<ul className="member-eligibility-reasons">{eligibility.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}{eligibility.eligible&&<p className="member-support-note">You meet the current loan application checks. Final amount and terms still need review.</p>}</>:<p className="member-support-error" role="status">{eligibilityError||'Loan checks are unavailable.'}</p>}
      <p className="member-support-note">Essential bill support: {supportEligible===true?'Your current member record meets the published contribution check.':supportEligible===false?'Your member record does not currently meet the published contribution check.': 'The support eligibility rule is not configured.'}</p>
    </section>

    <section className="member-section-card member-support-form-card"><div className="member-section-heading"><div><span><Building2 size={18}/></span><h2>What do you need help with?</h2></div></div>
      <label className="member-support-select">Choose one<select value={need} onChange={event=>{setNeed(event.target.value as Need);setError('');setMessage('')}}>{needs.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      <p className="member-section-intro">{selectedNeed.description} Every request is reviewed. A submitted request does not guarantee approval or payment.</p>
      {(error||message)&&<p className={error?'member-error':'member-success'} role={error?'alert':'status'}>{error||message}</p>}
      <form className="member-profile-form member-support-form" onSubmit={event=>void submit(event)}>
        {need==='LOAN'&&<>
          <label>Loan purpose<select name="loan_purpose" required defaultValue=""><option value="" disabled>Choose a purpose</option><option value="RENT">Rent</option><option value="BASIC_NEEDS">Food or household needs</option><option value="ELECTRICITY">Electricity</option><option value="WATER">Water</option><option value="COOKING_GAS">Cooking gas</option><option value="TRANSPORT">Transport</option><option value="SCHOOL_FEES">School or college fees</option><option value="MEDICAL">Medical or emergency</option><option value="BUSINESS">Business capital</option><option value="PERSONAL_LOAN">Personal needs</option></select></label>
          <label>Pay the loan to<select name="payout_method" defaultValue="MPESA"><option value="MPESA">My M-Pesa number</option><option value="BANK">My bank account</option></select></label>
          <label>M-Pesa number or bank account details<input name="payout_destination" minLength={5} maxLength={180} required placeholder="Enter the account you control"/></label>
        </>}
        {need==='RENT'&&<><label>Landlord or agent name<input name="landlord_name" maxLength={160} required/></label><div className="member-support-row"><label>Landlord phone<input name="landlord_phone" type="tel" pattern="[+]?[0-9 ()-]{9,20}" required/></label><label>Payment due date<input name="due_date" type="date" required/></label></div><label>Property location<input name="property_location" maxLength={240} required/></label><label>Landlord paybill, account or M-Pesa details<input name="payment_details" maxLength={240} required/></label></>}
        {need==='MEDICAL'&&<><label>Patient name<input name="patient_name" maxLength={160} required/></label><label>Hospital, clinic or pharmacy<input name="provider_name" maxLength={180} required/></label><div className="member-support-row"><label>Provider phone<input name="provider_phone" type="tel" pattern="[+]?[0-9 ()-]{9,20}"/></label><label>Payment due date<input name="due_date" type="date"/></label></div><label>Provider paybill, account or payment details<input name="payment_details" maxLength={240} required/></label></>}
        {need==='SCHOOL_FEES'&&<><label>Student name<input name="student_name" maxLength={160} required/></label><label>School or college name<input name="institution_name" maxLength={180} required/></label><div className="member-support-row"><label>Admission or student number<input name="admission_number" maxLength={100}/></label><label>Payment due date<input name="due_date" type="date" required/></label></div><label>School paybill, account or payment details<input name="payment_details" maxLength={240} required/></label></>}
        {need==='BASIC_NEEDS'&&<><label>Essential need<select name="service_category" required defaultValue=""><option value="" disabled>Choose a need</option><option value="FOOD">Food or groceries</option><option value="ELECTRICITY">Electricity tokens</option><option value="WATER">Water bill</option><option value="COOKING_GAS">Cooking gas</option><option value="TRANSPORT">Transport</option><option value="OTHER_ESSENTIAL">Other essential need</option></select></label><label>Supplier or payee name<input name="supplier_name" maxLength={180} required/></label><div className="member-support-row"><label>Supplier phone<input name="recipient_phone" type="tel" pattern="[+]?[0-9 ()-]{9,20}" required/></label><label>Payment due date<input name="due_date" type="date"/></label></div><label>Supplier payment details<input name="payment_details" maxLength={240} required/></label></>}
        <label>Amount requested (KES)<input name="amount" type="number" min="1" max="1000000000" step="0.01" required/></label>
        <label>{need==='LOAN'?'Explain why you need the loan':'Tell us about the bill or need'}<textarea name="reason" minLength={5} maxLength={1000} rows={4} required/></label>
        {need==='LOAN'&&<><label>Requested repayment period (months)<input name="repayment_months" type="number" min="1" max="120" step="1" required/><small>Requested only. Final repayment terms are set during review.</small></label><label>Income source<input name="income_source" maxLength={160} required/></label><label>Next of kin name<input name="next_of_kin_name" defaultValue={session.user.user_metadata?.next_of_kin_name??''} minLength={2} maxLength={160} required/></label><label>Next of kin phone<input name="next_of_kin_phone" type="tel" pattern="[+]?[0-9 ()-]{9,20}" defaultValue={session.user.user_metadata?.next_of_kin_phone??''} required/></label></>}
        <p className="member-support-note">Direct bill requests are requests for the cooperative to pay the named provider after approval. This app does not send M-Pesa or bank payments, and no grant is offered here.</p>
        <button className="member-primary" disabled={busy||loading}>{busy?'Sending request…':need==='LOAN'?'Submit loan request':'Submit bill support request'} <ArrowRight size={16}/></button>
      </form>
    </section>

    <section className="member-section-card member-support-history"><div className="member-section-heading"><div><span><FileText size={18}/></span><h2>Your requests and loans</h2></div></div>{loading?<p className="member-section-intro">Loading your requests…</p>:requestRows.length?<div className="member-request-list">{requestRows.map(item=><article className="member-record-row" key={item.id}><span className="member-request-icon">{item.kind==='LOAN'?<Banknote size={18}/>:<HeartPulse size={18}/>}</span><div><strong>{item.label}</strong><small>{new Date(item.date).toLocaleDateString('en-KE')} · {cash(item.amount)}</small></div><span className="member-finance-status">{item.status.replace(/_/g,' ')}</span></article>)}</div>:<p className="member-section-intro">No requests or active loans are linked to your account yet.</p>}
      <p className="member-support-note">A request marked submitted or under review has not been approved. A provider payment is complete only after the cooperative confirms it.</p>
    </section>
  </div>
}
