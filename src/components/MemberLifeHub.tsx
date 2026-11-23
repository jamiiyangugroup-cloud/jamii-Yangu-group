import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, CircleDollarSign, ExternalLink, HeartPulse, Home, LifeBuoy, Megaphone, Plus, RefreshCw, Search, ShoppingBag, Sparkles, Target, Wallet } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import '../life.css'

type Entry = { id:string; entry_type:'INCOME'|'EXPENSE'; entry_date:string; category:string; description:string|null; amount_kes:number }
type Goal = { id:string; title:string; purpose?:string; goal_type?:string; target_amount_kes:number; target_date:string|null }
type DirectoryRow = { id:string; name:string; provider_type?:string; description:string; website_url?:string|null; public_phone?:string|null; town?:string|null; county_id?:string|null }
type Offer = { id:string; title:string; description:string; terms:string; offer_url:string|null; ends_at:string; cooperative_partners?:{name:string}|{name:string}[]|null }
type Opportunity = { id:string; opportunity_type:string; title:string; organization_name:string; description:string; eligibility:string; application_url:string|null; deadline:string|null }
type Announcement = { id:string; title:string; body:string; published_at:string }
type Listing = { id:string; title:string; category:string; description:string; price_kes:number|null; town:string; status:string }
type LifeData = { entries:Entry[]; goals:Goal[]; familyGoals:Goal[]; services:DirectoryRow[]; offers:Offer[]; housing:DirectoryRow[]; opportunities:Opportunity[]; announcements:Announcement[]; listings:Listing[]; tickets:{id:string;subject:string;status:string;created_at:string}[] }

const empty:LifeData = {entries:[],goals:[],familyGoals:[],services:[],offers:[],housing:[],opportunities:[],announcements:[],listings:[],tickets:[]}
const today = () => new Date().toISOString().slice(0,10)
const monthStart = () => `${today().slice(0,7)}-01`
const cash = (amount:number) => `KES ${Number(amount||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const label = (value:string) => value.toLowerCase().replace(/_/g,' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function MemberLifeHub({session,memberId}:{session:Session;memberId:string|null}) {
  const [tab,setTab] = useState<'planner'|'services'|'opportunities'|'marketplace'|'community'|'help'>('planner')
  const [data,setData] = useState<LifeData>(empty)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')
  const [serviceFilter,setServiceFilter] = useState('')
  const [saved,setSaved] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!supabase) return
    setBusy(true); setError('')
    const [entries,goals,family,services,offers,housing,opportunities,announcements,listings,tickets,savedRows] = await Promise.all([
      supabase.from('member_budget_entries').select('id,entry_type,entry_date,category,description,amount_kes').eq('entry_month',monthStart()).order('entry_date',{ascending:false}),
      supabase.from('member_savings_goals').select('id,title,purpose,target_amount_kes,target_date').eq('status','ACTIVE').order('target_date',{ascending:true}),
      supabase.from('member_family_goals').select('id,title,goal_type,target_amount_kes,target_date').order('target_date',{ascending:true}),
      supabase.from('verified_service_providers').select('id,name,provider_type,description,website_url,public_phone,town,county_id').eq('status','VERIFIED').order('name').limit(40),
      supabase.from('partner_offers').select('id,title,description,terms,offer_url,ends_at,cooperative_partners(name)').eq('status','PUBLISHED').gte('ends_at',new Date().toISOString()).order('ends_at').limit(20),
      supabase.from('housing_opportunities').select('id,title,description,contact_url,contact_phone,town,county_id').eq('status','PUBLISHED').order('created_at',{ascending:false}).limit(20),
      supabase.from('member_opportunities').select('id,opportunity_type,title,organization_name,description,eligibility,application_url,deadline').eq('status','PUBLISHED').order('deadline').limit(30),
      supabase.from('cooperative_announcements').select('id,title,body,published_at').eq('active',true).order('published_at',{ascending:false}).limit(15),
      supabase.from('member_marketplace_listings').select('id,title,category,description,price_kes,town,status').eq('status','PUBLISHED').order('created_at',{ascending:false}).limit(30),
      supabase.from('member_support_tickets').select('id,subject,status,created_at').order('created_at',{ascending:false}).limit(10),
      supabase.from('member_opportunity_saves').select('opportunity_id'),
    ])
    const resultErrors = [entries.error,goals.error,family.error,services.error,offers.error,housing.error,opportunities.error,announcements.error,listings.error,tickets.error,savedRows.error].filter(Boolean)
    if (resultErrors.length) setError('Some life-services data is unavailable. Confirm the latest Supabase migrations are applied, then refresh.')
    setData({entries:(entries.data??[]) as Entry[],goals:(goals.data??[]) as Goal[],familyGoals:(family.data??[]) as Goal[],services:(services.data??[]) as DirectoryRow[],offers:(offers.data??[]) as Offer[],housing:(housing.data??[]).map((row)=>({id:row.id,name:row.title,description:row.description,website_url:row.contact_url,public_phone:row.contact_phone,town:row.town,county_id:row.county_id})) as DirectoryRow[],opportunities:(opportunities.data??[]) as Opportunity[],announcements:(announcements.data??[]) as Announcement[],listings:(listings.data??[]) as Listing[],tickets:(tickets.data??[]) as LifeData['tickets']})
    setSaved((savedRows.data??[]).map((row) => row.opportunity_id))
    setBusy(false)
  },[])

  useEffect(() => { void load() },[load])

  async function saveBudget(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(''); setSuccess('')
    const {error:insertError} = await supabase.from('member_budget_entries').insert({user_id:session.user.id,entry_month:monthStart(),entry_date:String(form.get('entry_date')),entry_type:String(form.get('entry_type')),category:String(form.get('category')).trim(),description:String(form.get('description')||'').trim()||null,amount_kes:Number(form.get('amount_kes'))})
    setBusy(false)
    if (insertError) { setError('This planner entry could not be saved. Check the amount and try again.'); return }
    event.currentTarget.reset(); setSuccess('Personal planner entry saved. This is not a cooperative ledger transaction.'); await load()
  }

  async function saveGoal(event:FormEvent<HTMLFormElement>,familyGoal=false) {
    event.preventDefault(); if (!supabase) return
    const form = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess('')
    const common = {user_id:session.user.id,title:String(form.get('title')).trim(),target_amount_kes:Number(form.get('target_amount_kes')),target_date:String(form.get('target_date')||'')||null}
    const insertResult = familyGoal
      ? await supabase.from('member_family_goals').insert({...common,goal_type:String(form.get('purpose'))})
      : await supabase.from('member_savings_goals').insert({...common,purpose:String(form.get('purpose'))})
    const {error:insertError} = insertResult
    setBusy(false)
    if (insertError) { setError('The goal could not be saved. Check the amount and try again.'); return }
    event.currentTarget.reset(); setSuccess('Your private goal has been saved.'); await load()
  }

  async function createTicket(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const form = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess('')
    const {error:insertError} = await supabase.from('member_support_tickets').insert({user_id:session.user.id,category:String(form.get('category')),subject:String(form.get('subject')).trim(),message:String(form.get('message')).trim()})
    setBusy(false)
    if (insertError) { setError('Your request could not be sent. Please check the details and try again.'); return }
    event.currentTarget.reset(); setSuccess('Your support request was submitted.'); await load()
  }

  async function saveOpportunity(id:string) {
    if (!supabase) return
    setBusy(true); setError('')
    if (saved.includes(id)) {
      const {error:deleteError} = await supabase.from('member_opportunity_saves').delete().eq('opportunity_id',id).eq('user_id',session.user.id)
      if (deleteError) setError('Could not remove the saved opportunity.')
      else setSaved((items) => items.filter((item) => item!==id))
    } else {
      const {error:insertError} = await supabase.from('member_opportunity_saves').insert({user_id:session.user.id,opportunity_id:id})
      if (insertError) setError('Could not save this opportunity. Refresh and try again.')
      else setSaved((items) => [...items,id])
    }
    setBusy(false)
  }

  async function createListing(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !memberId) return
    const form = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess('')
    const {error:insertError} = await supabase.from('member_marketplace_listings').insert({member_id:memberId,title:String(form.get('title')).trim(),category:String(form.get('category')).trim(),description:String(form.get('description')).trim(),price_kes:form.get('price_kes')?Number(form.get('price_kes')):null,contact_phone:String(form.get('contact_phone')).trim(),county_id:String(form.get('county_id')),town:String(form.get('town')).trim(),consent_to_publish_contact:form.get('consent')==='on'})
    setBusy(false)
    if (insertError) { setError('The listing could not be submitted. Check the information and try again.'); return }
    event.currentTarget.reset(); setSuccess('Listing submitted for cooperative review. It will not be public before approval.'); await load()
  }

  const income = data.entries.filter((entry) => entry.entry_type==='INCOME').reduce((sum,entry)=>sum+Number(entry.amount_kes),0)
  const expenses = data.entries.filter((entry) => entry.entry_type==='EXPENSE').reduce((sum,entry)=>sum+Number(entry.amount_kes),0)
  const visibleServices = data.services.filter((item) => !serviceFilter || item.provider_type===serviceFilter)

  return <section className="life-hub">
    <div className="life-head"><div><span className="member-eyebrow">MY LIFE & BENEFITS</span><h2>Everyday value, built together.</h2><p>Private planning tools and verified community services. Provider listings and offers appear only after cooperative verification.</p></div><button className="life-reload" onClick={()=>void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div>
    <nav className="life-tabs" aria-label="My Life and Benefits">{[
      ['planner','Planner',<Wallet size={15}/>],['services','Services & offers',<HeartPulse size={15}/>],['opportunities','Opportunities',<BriefcaseBusiness size={15}/>],['marketplace','Marketplace',<ShoppingBag size={15}/>],['community','Community',<Megaphone size={15}/>],['help','Help centre',<LifeBuoy size={15}/>],
    ].map(([key,name,icon])=><button key={String(key)} className={tab===key?'active':''} onClick={()=>setTab(key as typeof tab)}>{icon}{name}</button>)}</nav>
    {(error||success)&&<div className={error?'life-message life-error':'life-message life-success'} role="status">{error||success}</div>}

    {tab==='planner'&&<div className="life-grid">
      <section className="life-panel life-budget"><div className="life-panel-title"><span><CircleDollarSign size={17}/></span><div><h3>Monthly budget planner</h3><small>{new Date().toLocaleDateString('en-KE',{month:'long',year:'numeric'})} · personal entries</small></div></div><div className="life-budget-totals"><div><small>Income entered</small><strong>{cash(income)}</strong></div><div><small>Expenses entered</small><strong>{cash(expenses)}</strong></div><div><small>Planned balance</small><strong>{cash(income-expenses)}</strong></div></div><p className="life-disclaimer">These figures are entered by you for planning. They are not verified income, account balances or cooperative transactions.</p><form className="life-form" onSubmit={saveBudget}><label>Entry type<select name="entry_type" defaultValue="EXPENSE"><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></label><label>Category<input name="category" placeholder="Food, rent, salary…" maxLength={60} required/></label><div className="life-form-row"><label>Amount (KES)<input name="amount_kes" type="number" min="1" step="0.01" required/></label><label>Date<input name="entry_date" type="date" defaultValue={today()} required/></label></div><label>Note (optional)<input name="description" maxLength={240}/></label><button className="life-action" disabled={busy}><Plus size={15}/> Add planner entry</button></form><div className="life-record-list">{data.entries.map((entry)=><article key={entry.id}><span className={entry.entry_type==='INCOME'?'income-mark':'expense-mark'}>{entry.entry_type==='INCOME'?'+':'−'}</span><div><strong>{entry.category}</strong><small>{entry.entry_date}{entry.description?` · ${entry.description}`:''}</small></div><b>{cash(entry.amount_kes)}</b></article>)}{!data.entries.length&&<p className="life-empty">No budget entries this month. Add one to start planning.</p>}</div></section>
      <div className="life-stack"><section className="life-panel"><div className="life-panel-title"><span><Target size={17}/></span><div><h3>Savings goals</h3><small>Personal targets only; funds are not moved by this planner.</small></div></div><form className="life-form" onSubmit={(event)=>void saveGoal(event)}><label>Goal name<input name="title" placeholder="Emergency fund" maxLength={100} required/></label><div className="life-form-row"><label>Purpose<select name="purpose"><option value="EMERGENCY">Emergency</option><option value="SCHOOL_FEES">School fees</option><option value="RENT">Rent</option><option value="BUSINESS">Business</option><option value="FAMILY">Family</option><option value="OTHER">Other</option></select></label><label>Target (KES)<input name="target_amount_kes" type="number" min="1" step="0.01" required/></label></div><label>Target date (optional)<input name="target_date" type="date"/></label><button className="life-action" disabled={busy}><Plus size={15}/> Create savings goal</button></form><div className="life-record-list">{data.goals.map((goal)=><article key={goal.id}><span className="goal-mark"><Target size={15}/></span><div><strong>{goal.title}</strong><small>{label(goal.goal_type||goal.purpose||'OTHER')}{goal.target_date?` · by ${goal.target_date}`:''}</small></div><b>{cash(goal.target_amount_kes)}</b></article>)}{!data.goals.length&&<p className="life-empty">No personal savings goals yet.</p>}</div></section>
      <section className="life-panel"><div className="life-panel-title"><span><Sparkles size={17}/></span><div><h3>Family goals</h3><small>Private household planning</small></div></div><form className="life-form" onSubmit={(event)=>void saveGoal(event,true)}><label>Goal name<input name="title" placeholder="School term plan" maxLength={100} required/></label><div className="life-form-row"><label>Goal type<select name="purpose"><option value="EDUCATION">Education</option><option value="HOUSING">Housing</option><option value="EMERGENCY">Emergency</option><option value="HOUSEHOLD">Household</option><option value="OTHER">Other</option></select></label><label>Target (KES)<input name="target_amount_kes" type="number" min="1" step="0.01" required/></label></div><label>Target date (optional)<input name="target_date" type="date"/></label><button className="life-action" disabled={busy}><Plus size={15}/> Add family goal</button></form><div className="life-record-list">{data.familyGoals.map((goal)=><article key={goal.id}><span className="goal-mark"><Target size={15}/></span><div><strong>{goal.title}</strong><small>{label(goal.goal_type||goal.purpose||'OTHER')}{goal.target_date?` · by ${goal.target_date}`:''}</small></div><b>{cash(goal.target_amount_kes)}</b></article>)}{!data.familyGoals.length&&<p className="life-empty">No family goals yet.</p>}</div></section></div>
    </div>}

    {tab==='services'&&<div className="life-grid life-directory-grid"><section className="life-panel"><div className="life-panel-title"><span><Search size={17}/></span><div><h3>Verified essential services</h3><small>Electricity, water, internet, education, health and housing</small></div></div><label className="life-filter">Filter service<select value={serviceFilter} onChange={(event)=>setServiceFilter(event.target.value)}><option value="">All services</option>{['ELECTRICITY','WATER','INTERNET','SCHOOL_FEES','HEALTHCARE','HOUSING','BUILDING_MATERIALS','OTHER_ESSENTIAL'].map((type)=><option key={type} value={type}>{label(type)}</option>)}</select></label><div className="life-directory-list">{visibleServices.map((service)=><article key={service.id}><span className="directory-icon">{service.provider_type==='HEALTHCARE'?<HeartPulse size={18}/>:service.provider_type==='HOUSING'?<Home size={18}/>:<CircleDollarSign size={18}/>}</span><div><strong>{service.name}</strong><small>{label(service.provider_type||'SERVICE')}{service.town?` · ${service.town}`:''}</small><p>{service.description}</p>{service.public_phone&&<small>Contact: {service.public_phone}</small>}</div>{service.website_url&&<a href={service.website_url} target="_blank" rel="noreferrer" aria-label={`Visit ${service.name} website`}><ExternalLink size={16}/></a>}</article>)}{!visibleServices.length&&<p className="life-empty">No verified provider is listed for this filter yet. We will show providers after the cooperative verifies their details; no provider is being implied or endorsed.</p>}</div></section><div className="life-stack"><section className="life-panel"><div className="life-panel-title"><span><Sparkles size={17}/></span><div><h3>Member offers</h3><small>Only current offers from verified partners</small></div></div>{data.offers.map((offer)=><article className="life-offer" key={offer.id}><small>{Array.isArray(offer.cooperative_partners)?offer.cooperative_partners[0]?.name:offer.cooperative_partners?.name}</small><strong>{offer.title}</strong><p>{offer.description}</p><p className="offer-terms">{offer.terms}</p><small>Valid until {new Date(offer.ends_at).toLocaleDateString('en-KE')}</small>{offer.offer_url&&<a href={offer.offer_url} target="_blank" rel="noreferrer">View partner offer <ArrowUpRight size={13}/></a>}</article>)}{!data.offers.length&&<p className="life-empty">No verified member discounts are available yet. Offers will appear here after a partner agreement is verified.</p>}</section><section className="life-panel"><div className="life-panel-title"><span><Home size={17}/></span><div><h3>Housing opportunities</h3><small>Verified listings only</small></div></div>{data.housing.map((home)=><article className="life-simple-row" key={home.id}><strong>{home.name}</strong><small>{home.town||'Location not specified'}</small><p>{home.description}</p>{home.website_url&&<a href={home.website_url} target="_blank" rel="noreferrer">View listing <ExternalLink size={13}/></a>}</article>)}{!data.housing.length&&<p className="life-empty">No verified housing listing is available yet.</p>}</section></div></div>}

    {tab==='opportunities'&&<section className="life-panel"><div className="life-panel-title"><span><BriefcaseBusiness size={17}/></span><div><h3>Jobs, learning and opportunities</h3><small>Verified opportunities published by authorized reviewers</small></div></div><div className="life-opportunity-list">{data.opportunities.map((item)=><article key={item.id}><span className="opportunity-kind">{label(item.opportunity_type)}</span><div><h4>{item.title}</h4><small>{item.organization_name}{item.deadline?` · Deadline ${new Date(`${item.deadline}T00:00:00`).toLocaleDateString('en-KE')}`:''}</small><p>{item.description}</p><p className="opportunity-eligibility"><b>Eligibility:</b> {item.eligibility}</p><div className="opportunity-actions"><button onClick={()=>void saveOpportunity(item.id)} disabled={busy}>{saved.includes(item.id)?<Check size={14}/>:<Plus size={14}/>} {saved.includes(item.id)?'Saved':'Save opportunity'}</button>{item.application_url&&<a href={item.application_url} target="_blank" rel="noreferrer">Go to application <ExternalLink size={13}/></a>}</div></div></article>)}{!data.opportunities.length&&<p className="life-empty">No verified jobs, scholarships, bursaries or training programmes have been published yet.</p>}</div></section>}

    {tab==='marketplace'&&<div className="life-grid life-market-grid"><section className="life-panel"><div className="life-panel-title"><span><ShoppingBag size={17}/></span><div><h3>Member marketplace</h3><small>Listings are reviewed before anyone can see them.</small></div></div><div className="life-directory-list">{data.listings.map((item)=><article key={item.id}><span className="directory-icon"><ShoppingBag size={18}/></span><div><strong>{item.title}</strong><small>{label(item.category)} · {item.town}</small><p>{item.description}</p>{item.price_kes!==null&&<b>{cash(item.price_kes)}</b>}</div></article>)}{!data.listings.length&&<p className="life-empty">No approved member listings are available yet.</p>}</div></section><section className="life-panel"><div className="life-panel-title"><span><Plus size={17}/></span><div><h3>Submit a business listing</h3><small>Available to approved members. Your listing stays private until review.</small></div></div>{memberId?<form className="life-form" onSubmit={createListing}><label>Product or service<input name="title" maxLength={120} required/></label><label>Category<input name="category" maxLength={80} required/></label><label>Description<textarea name="description" rows={4} minLength={10} maxLength={2000} required/></label><div className="life-form-row"><label>Price (KES, optional)<input name="price_kes" type="number" min="0" step="0.01"/></label><label>Contact phone<input name="contact_phone" type="tel" required/></label></div><div className="life-form-row"><label>County ID<input name="county_id" placeholder="Provided after county directory setup" required/></label><label>Town<input name="town" maxLength={100} required/></label></div><label className="life-consent"><input type="checkbox" name="consent" required/><span>I consent to the cooperative publishing my contact number if this listing is approved.</span></label><button className="life-action" disabled={busy}><Plus size={15}/> Submit for review</button></form>:<p className="life-empty">Approved membership is required to submit a marketplace listing.</p>}</section></div>}

    {tab==='community'&&<section className="life-panel"><div className="life-panel-title"><span><Megaphone size={17}/></span><div><h3>Cooperative announcements</h3><small>Current updates published by the cooperative</small></div></div>{data.announcements.map((item)=><article className="life-announcement" key={item.id}><CalendarDays size={16}/><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.published_at).toLocaleDateString('en-KE')}</small></div></article>)}{!data.announcements.length&&<p className="life-empty">No current announcements yet.</p>}<div className="life-governance-note">Digital voting and member polls will appear only after the cooperative enables them under its approved governance rules.</div></section>}

    {tab==='help'&&<div className="life-grid life-help-grid"><section className="life-panel"><div className="life-panel-title"><span><LifeBuoy size={17}/></span><div><h3>Contact member support</h3><small>Send a private support request and track its status</small></div></div><form className="life-form" onSubmit={createTicket}><label>Request type<select name="category"><option value="ACCOUNT">Account</option><option value="APPLICATION">Membership application</option><option value="PAYMENT">Payment enquiry</option><option value="TECHNICAL">Technical issue</option><option value="COMPLAINT">Complaint</option><option value="SUGGESTION">Suggestion</option><option value="OTHER">Other</option></select></label><label>Subject<input name="subject" minLength={3} maxLength={160} required/></label><label>Message<textarea name="message" rows={5} minLength={10} maxLength={5000} required/></label><button className="life-action" disabled={busy}><ArrowRight size={15}/> Send private request</button></form></section><section className="life-panel"><div className="life-panel-title"><span><FileTextIcon/></span><div><h3>My support requests</h3><small>Private to your account</small></div></div>{data.tickets.map((ticket)=><article className="life-simple-row" key={ticket.id}><strong>{ticket.subject}</strong><small>{label(ticket.status)} · {new Date(ticket.created_at).toLocaleDateString('en-KE')}</small></article>)}{!data.tickets.length&&<p className="life-empty">You have no support requests yet.</p>}</section></div>}
  </section>
}

function FileTextIcon(){return <BookOpen size={17}/>}
