import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Activity, ArrowDownLeft, ArrowRight, BadgeCheck, Bell, BriefcaseBusiness, Building2, Camera, Check, ChevronDown, CircleDollarSign, ClipboardList, Download, FileText, HandCoins, Heart, Home, Landmark, LifeBuoy, LogOut, Menu, PiggyBank, RefreshCw, ShieldCheck, ShoppingBag, TrendingUp, UserRound, UsersRound, Wallet, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Logo from './Logo'
import MemberLifeHub from './MemberLifeHub'
import MemberLoans from './MemberLoans'
import '../member.css'
import '../member-responsive.css'

type Page = 'dashboard'|'account'|'groups'|'membership'|'applications'|'finances'|'loans'|'investments'|'savings'|'life'|'planner'|'family-goals'|'services'|'opportunities'|'marketplace'|'community'|'notifications'|'help'|'profile'|'settings'
type MemberWorkspaceData = {
  member: null | { id:string; county_id:string; membership_number:string; status:string; approved_at:string; county:string; branch:string|null; display_name:string }
  applications: { id:string; status:string; payment_status:string; registration_fee_kes:number|null; monthly_contribution_agreed_kes:number|null; created_at:string }[]
  monthly_contribution_due_kes:number|null
  contributions:{verified_months:number;verified_total_kes:number;current_month_paid:boolean;assistance_eligible:boolean|null}
  active_loans:number; assistance_requests:number; active_investments:number
  notifications:{id:string;title:string;body:string;created_at:string;read_at:string|null}[]
}
type ActivityItem = { id:string; amount_kes:number; status?:string; created_at:string; purpose?:string; month?:string; type?:string; fund_type?:string; account_reference?:string }
type FinancialData = { payments:ActivityItem[]; contributions:ActivityItem[]; savings:{account_reference:string;status:string;transactions:ActivityItem[]}[]; share_capital:ActivityItem[]; welfare:ActivityItem[] }
type Profile = { display_name:string|null; phone_number:string|null; email_address:string|null; account_status:string }
type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>}

const primaryNav:{key:Page;label:string;icon:typeof Home}[]=[
  {key:'dashboard',label:'Home',icon:Home},{key:'account',label:'Account',icon:UserRound},
  {key:'savings',label:'Savings',icon:PiggyBank},{key:'loans',label:'Support',icon:HandCoins},
]
const moreNav:{key:Page;label:string;icon:typeof Home}[]=[
  {key:'groups',label:'My Groups',icon:UsersRound},
  {key:'finances',label:'Transactions',icon:Activity},{key:'life',label:'Life & benefits',icon:Heart},
  {key:'applications',label:'My application',icon:ClipboardList},
]
const titles:Record<Page,string>={dashboard:'Home',account:'My Account',groups:'My Groups',membership:'Membership details',applications:'Applications',finances:'Transactions & statements',loans:'Loans & Support',investments:'Investments',savings:'My Savings',life:'Life & benefits',planner:'Monthly budget', 'family-goals':'Family goals',services:'Services & offers',opportunities:'Opportunities',marketplace:'Marketplace',community:'Community',notifications:'Notifications',help:'Help centre',profile:'Profile',settings:'Settings'}
const money=(value:number)=>`KSh ${Number(value||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const pageFromHash=():Page=>{const candidate=window.location.hash.slice(1) as Page;return candidate in titles?candidate:'dashboard'}
const isMobile=()=>window.innerWidth<=900||(window.innerWidth<=1024&&window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches)
const isMorePage=(page:Page)=>moreNav.some(item=>item.key===page)||(['planner','family-goals','services','opportunities','marketplace','community','help'].includes(page))
async function readOwnFinancialData(userId:string,memberId:string|null):Promise<FinancialData|null>{
  if(!supabase)return null
  const [payments,contributions,accounts,shares,welfare]=await Promise.all([
    supabase.from('payments').select('id,purpose,amount_kes,status,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(100),
    memberId?supabase.from('member_contributions').select('id,contribution_month,amount_kes,status,created_at').eq('member_id',memberId).order('contribution_month',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
    memberId?supabase.from('member_savings').select('id,account_reference,status').eq('member_id',memberId):Promise.resolve({data:[],error:null}),
    memberId?supabase.from('share_capital').select('id,amount_kes,status,created_at').eq('member_id',memberId).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
    memberId?supabase.from('welfare_funds').select('id,fund_type,amount_kes,status,created_at').eq('member_id',memberId).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
  ])
  if([payments,contributions,accounts,shares,welfare].some(result=>result.error))return null
  const accountRows=(accounts.data??[]) as {id:string;account_reference:string;status:string}[]
  const transactions=accountRows.length?await supabase.from('savings_transactions').select('id,savings_account_id,transaction_type,amount_kes,created_at').in('savings_account_id',accountRows.map(row=>row.id)).order('created_at',{ascending:false}).limit(200):{data:[],error:null}
  if(transactions.error)return null
  const tx=(transactions.data??[]) as {id:string;savings_account_id:string;transaction_type:string;amount_kes:number;created_at:string}[]
  return {
    payments:(payments.data??[]) as ActivityItem[],
    contributions:(contributions.data??[]).map((item:any)=>({id:item.id,month:item.contribution_month,amount_kes:item.amount_kes,status:item.status,created_at:item.created_at})) as ActivityItem[],
    savings:accountRows.map(account=>({account_reference:account.account_reference,status:account.status,transactions:tx.filter(item=>item.savings_account_id===account.id).map(item=>({id:item.id,type:item.transaction_type,amount_kes:item.amount_kes,status:'RECORDED',created_at:item.created_at}))})),
    share_capital:(shares.data??[]) as ActivityItem[],welfare:(welfare.data??[]) as ActivityItem[],
  }
}

export default function MemberPortal(){
  const [session,setSession]=useState<Session|null>(null)
  const [workspace,setWorkspace]=useState<MemberWorkspaceData|null>(null)
  const [financial,setFinancial]=useState<FinancialData|null>(null)
  const [loanSummary,setLoanSummary]=useState<{savings_balance_kes:number;active_loan_count:number}|null>(null)
  const [profile,setProfile]=useState<Profile|null>(null)
  const [regionName,setRegionName]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [page,setPage]=useState<Page>(pageFromHash)
  const [menuOpen,setMenuOpen]=useState(false)
  const [moreOpen,setMoreOpen]=useState(false)
  const [installPrompt,setInstallPrompt]=useState<InstallPromptEvent|null>(null)
  const [installMessage,setInstallMessage]=useState('')
  const [appInstalled,setAppInstalled]=useState(()=>window.matchMedia('(display-mode: standalone)').matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone))
  const [mobileLayout,setMobileLayout]=useState(isMobile)
  const [collapsed,setCollapsed]=useState(false)
  const [financeTab,setFinanceTab]=useState<'overview'|'contributions'|'payments'|'statements'|'history'>('overview')
  const [passwordMessage,setPasswordMessage]=useState('')

  const loadWorkspace=useCallback(async(activeSession:Session)=>{
    if(!supabase)return
    setSession(activeSession);setLoading(true);setError('')
    const [workspaceResult,financeResult,profileResult,notificationResult,loanResult]=await Promise.all([
      supabase.rpc('get_my_member_workspace'),
      supabase.rpc('get_my_member_financial_activity'),
      supabase.from('user_profiles').select('display_name,phone_number,email_address,account_status').eq('user_id',activeSession.user.id).maybeSingle(),
      supabase.from('notifications').select('id,title,body,created_at,read_at').eq('user_id',activeSession.user.id).order('created_at',{ascending:false}).limit(100),
      supabase.rpc('get_my_loan_eligibility'),
    ])
    if(workspaceResult.error){setWorkspace(null);setError('We could not load your member workspace. Please refresh or contact member support.')}
    else {
      const workspaceData=workspaceResult.data as MemberWorkspaceData
      setWorkspace({...workspaceData,notifications:notificationResult.error?workspaceData.notifications:(notificationResult.data??[]) as MemberWorkspaceData['notifications']})
      if(workspaceData.member?.county_id){const {data:county}=await supabase.from('counties').select('regions(name)').eq('id',workspaceData.member.county_id).maybeSingle();const related=county?.regions as {name:string}|{name:string}[]|null;setRegionName(Array.isArray(related)?related[0]?.name??null:related?.name??null)}else setRegionName(null)
    }
    setFinancial(financeResult.error?await readOwnFinancialData(activeSession.user.id,(workspaceResult.data as MemberWorkspaceData|null)?.member?.id??null):financeResult.data as FinancialData)
    setLoanSummary(loanResult.error?null:loanResult.data as {savings_balance_kes:number;active_loan_count:number})
    setProfile(profileResult.error?null:profileResult.data as Profile|null)
    setLoading(false)
  },[])

  useEffect(()=>{
    if(!supabase){setLoading(false);return}
    void supabase.auth.getSession().then(({data})=>data.session?loadWorkspace(data.session):setLoading(false))
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
      if(next) void loadWorkspace(next)
      else{setSession(null);setWorkspace(null);setFinancial(null);setLoanSummary(null);setProfile(null);setLoading(false)}
    })
    return()=>subscription.unsubscribe()
  },[loadWorkspace])

  useEffect(()=>{const handle=()=>setPage(pageFromHash());window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle)},[])
  useEffect(()=>{const resize=()=>{const mobile=isMobile();setMobileLayout(mobile);if(!mobile)setMenuOpen(false)};window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[])
  useEffect(()=>{if(!menuOpen)return;const prior=document.body.style.overflow;document.body.style.overflow='hidden';const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenuOpen(false)};window.addEventListener('keydown',escape);return()=>{document.body.style.overflow=prior;window.removeEventListener('keydown',escape)}},[menuOpen])
  useEffect(()=>{
    const onBeforeInstall=(event:Event)=>{event.preventDefault();setInstallPrompt(event as InstallPromptEvent)}
    const onInstalled=()=>{setAppInstalled(true);setInstallPrompt(null);setInstallMessage('Jamii Yangu is installed on this device.')}
    window.addEventListener('beforeinstallprompt',onBeforeInstall)
    window.addEventListener('appinstalled',onInstalled)
    return()=>{window.removeEventListener('beforeinstallprompt',onBeforeInstall);window.removeEventListener('appinstalled',onInstalled)}
  },[])

  const notifications=workspace?.notifications??[]
  const unread=notifications.filter(item=>!item.read_at).length
  const name=profile?.display_name||session?.user.user_metadata?.display_name||session?.user.email?.split('@')[0]||'Member'
  const financialItems=useMemo(()=>[
    ...(financial?.payments??[]).map(item=>({id:`payment-${item.id}`,label:`Payment Â· ${(item.purpose??'').replace(/_/g,' ')}`,type:'payment',amount:item.amount_kes,status:item.status??'UNKNOWN',date:item.created_at,reference:item.id})),
    ...(financial?.contributions??[]).map(item=>({id:`contribution-${item.id}`,label:`Contribution Â· ${item.month??''}`,type:'contribution',amount:item.amount_kes,status:item.status??'UNKNOWN',date:item.created_at,reference:item.id})),
    ...(financial?.savings??[]).flatMap(account=>account.transactions.map(item=>({id:`savings-${item.id}`,label:`Savings Â· ${(item.type??'').replace(/_/g,' ')}`,type:'savings',amount:item.amount_kes,status:item.status??'RECORDED',date:item.created_at,reference:account.account_reference}))),
    ...(financial?.share_capital??[]).map(item=>({id:`share-${item.id}`,label:'Share capital',type:'contribution',amount:item.amount_kes,status:item.status??'UNKNOWN',date:item.created_at,reference:item.id})),
    ...(financial?.welfare??[]).map(item=>({id:`welfare-${item.id}`,label:`Welfare Â· ${item.fund_type??''}`,type:'contribution',amount:item.amount_kes,status:item.status??'UNKNOWN',date:item.created_at,reference:item.id})),
  ].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()),[financial])
  const verifiedFinancialItems=useMemo(()=>financialItems.filter(item=>item.status==='VERIFIED'||item.status==='RECORDED'),[financialItems])

  async function refresh(){if(session)await loadWorkspace(session)}
  async function installApp(){
    if(appInstalled){setInstallMessage('Jamii Yangu is already installed on this device.');return}
    if(!installPrompt){
      const isApple=/iphone|ipad|ipod/i.test(navigator.userAgent)
      setInstallMessage(isApple?'To install, tap Share in your browser, then choose Add to Home Screen.':'Install is not available in this browser yet. Try Chrome or Edge and use its Install app option.')
      return
    }
    try{
      await installPrompt.prompt()
      const result=await installPrompt.userChoice
      setInstallMessage(result.outcome==='accepted'?'Jamii Yangu is being installed.':'Installation was cancelled.')
      setInstallPrompt(null)
    }catch{
      setInstallMessage('Your browser could not start installation. Try its browser menu and choose Install app or Add to Home Screen.')
    }
  }
  async function signOut(){if(!supabase)return;setBusy(true);const {error:signOutError}=await supabase.auth.signOut();setBusy(false);if(signOutError){setError('We could not sign you out. Please try again.');return}setWorkspace(null);setSession(null);setMenuOpen(false);window.location.assign('/')}
  async function setNotificationRead(id?:string){if(!supabase||!session)return;setBusy(true);setError('');let query=supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',session.user.id).is('read_at',null);if(id)query=query.eq('id',id);const {error:readError}=await query;setBusy(false);if(readError)setError('Notification status could not be updated.');else await refresh()}
  async function updateProfile(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase||!session)return;const form=new FormData(event.currentTarget);setBusy(true);setError('');setMessage('');const {error:saveError}=await supabase.from('user_profiles').update({display_name:String(form.get('display_name')).trim(),phone_number:String(form.get('phone_number')).trim()}).eq('user_id',session.user.id);setBusy(false);if(saveError)setError('Profile details could not be saved. Check the information and try again.');else{setMessage('Your profile was updated.');await refresh()}}
  async function changePassword(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase)return;const form=new FormData(event.currentTarget),password=String(form.get('password')??''),confirmation=String(form.get('confirmation')??'');if(password.length<12){setPasswordMessage('Use at least 12 characters.');return}if(password!==confirmation){setPasswordMessage('The passwords do not match.');return}setBusy(true);setPasswordMessage('');const {error:passwordError}=await supabase.auth.updateUser({password});setBusy(false);setPasswordMessage(passwordError?'Password could not be updated. Please sign in again and retry.':'Password updated successfully.');if(!passwordError)event.currentTarget.reset()}
  function navigate(next:Page){window.location.hash=next;setPage(next);setMenuOpen(false);setMoreOpen(false);setError('');setMessage('')}

  const savingsExists=Boolean(financial?.savings.length)
  const membershipSummary=workspace?(workspace.member?.status??workspace.applications[0]?.status??'NOT_YET_APPROVED'):'UNAVAILABLE'
  const cards=[
    {label:'My savings',value:!financial?'Unavailable':savingsExists?(loanSummary?money(loanSummary.savings_balance_kes):'Unavailable'):'No records yet',note:!financial?'Savings records unavailable':savingsExists?`${financial.savings.length} cooperative account${financial.savings.length===1?'':'s'}`:'Cooperative savings balance',icon:PiggyBank,page:'savings' as Page},
    {label:'My loans',value:loanSummary?String(loanSummary.active_loan_count):'Unavailable',note:loanSummary?.active_loan_count?'Active authorized loans':'No active loans',icon:HandCoins,page:'loans' as Page},
    {label:'My contributions',value:workspace?money(workspace.contributions.verified_total_kes):'Unavailable',note:workspace?`${workspace.contributions.verified_months} verified months`:'Records unavailable',icon:CircleDollarSign,page:'finances' as Page},
    {label:'Membership status',value:membershipSummary.replace(/_/g,' '),note:workspace?.member?.membership_number??(workspace?.applications.length?'View your application status':workspace?'Application not started':'Status unavailable'),icon:BadgeCheck,page:'membership' as Page},
  ]

  return <div className="member-app member-shell">
    <header className="member-topbar">{session&&<button className="member-mobile-menu" onClick={()=>setMenuOpen(open=>!open)} aria-label={menuOpen?'Close navigation':'Open navigation'} aria-expanded={menuOpen} aria-controls="member-sidebar">{menuOpen?<X size={21}/>:<Menu size={21}/>}</button>}<Logo homePath="/member#dashboard"/><div className="member-header-actions">{session?<><a href="/" className="member-home-link">Cooperative website</a><button className="member-notification-action" onClick={()=>navigate('notifications')} aria-label={`Notifications${unread?`, ${unread} unread`:''}`}><Bell size={19}/>{unread>0&&<span>{unread>99?'99+':unread}</span>}</button><div className="member-user-chip"><span>{name.trim().slice(0,1).toUpperCase()}</span><strong>{name}</strong></div><button onClick={()=>void signOut()} className="member-signout" disabled={busy}><LogOut size={16}/><span>Sign out</span></button></>:<a href="/" className="member-home-link">Cooperative website</a>}</div></header>
    {menuOpen&&<button type="button" className="member-nav-scrim" aria-label="Close navigation" onClick={()=>setMenuOpen(false)}/>}
    <div className={`member-layout ${collapsed?'sidebar-collapsed':''} ${!session?'member-layout-guest':''}`}>
      {session&&<aside id="member-sidebar" className={`member-sidebar ${menuOpen?'is-open':''}`} aria-hidden={mobileLayout&&!menuOpen}>
        <div className="member-sidebar-top"><span className="member-eyebrow">MEMBER WORKSPACE</span><button className="member-collapse" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} onClick={()=>setCollapsed(value=>!value)}><ChevronDown size={17}/></button></div>
        <nav className="member-primary-nav" aria-label="Member workspace navigation">{primaryNav.map(item=>{const Icon=item.icon;const active=page===item.key||(item.key==='account'&&['membership','profile','settings','notifications'].includes(page))||(item.key==='savings'&&['finances'].includes(page));return <a key={item.key} href={`/member#${item.key}`} className={`member-nav-link ${active?'active':''}`} title={collapsed?item.label:undefined} aria-current={active?'page':undefined} onClick={event=>{event.preventDefault();navigate(item.key)}}><Icon size={18}/><span>{item.label}</span></a>})}
          <button type="button" className={`member-nav-link member-more-toggle ${moreOpen||isMorePage(page)?'active':''}`} aria-expanded={moreOpen} onClick={()=>setMoreOpen(open=>!open)}><ChevronDown size={18}/><span>More</span><small>{unread>0?unread:''}</small></button>
          {moreOpen&&<section className="member-more-list" aria-label="More member services">{moreNav.filter(item=>item.key!=='groups'||Boolean(workspace?.member)).map(item=>{const Icon=item.icon;return <a key={item.key} href={item.key==='groups'?'/chama':`/member#${item.key}`} className={`member-nav-link ${page===item.key?'active':''}`} aria-current={page===item.key?'page':undefined} onClick={event=>{if(item.key==='groups')return;event.preventDefault();navigate(item.key)}}><Icon size={17}/><span>{item.label}</span></a>})}</section>}
        </nav>
        <div className="member-sidebar-bottom"><ShieldCheck size={17}/><span>Your records are private to your account.</span></div>
      </aside>}
      <main className="member-main" id="member-main">
        {loading?<div className="member-loading"><span/> Loading your secure member workspaceâ€¦</div>:!session?<section className="member-auth-gate"><div><span className="member-eyebrow">JAMII YANGU MEMBER ACCESS</span><h1>Your cooperative, at a glance.</h1><p>Sign in to view your membership, financial records and member services.</p><a className="member-primary" href="/?mode=signin">Sign in securely <ArrowRight size={16}/></a><p>New to the cooperative? <a href="/?join=1">Create an account</a></p></div></section>:<>
          <div className="member-page-heading"><div><span className="member-eyebrow">{page==='dashboard'?'MY JAMII YANGU':'YOUR MEMBER WORKSPACE'}</span><h1>{page==='dashboard'?`Welcome back, ${name}.`:titles[page]}</h1><p>{page==='dashboard'?'Manage your membership, savings, loans and benefits in one place.':pageDescriptions[page]}</p></div><button className="member-refresh" onClick={()=>void refresh()} disabled={loading||busy}><RefreshCw size={16}/> Refresh</button></div>
          {(error||message)&&<div className={error?'member-error':'member-success'} role={error?'alert':'status'}>{error||message}</div>}
          {page==='dashboard'&&<>
            <section className="member-summary-grid">{cards.map(card=>{const Icon=card.icon;return <button className="member-summary-card" key={card.label} onClick={()=>navigate(card.page)}><span className="member-summary-icon"><Icon size={20}/></span><small>{card.label}</small><strong>{card.value}</strong><p>{card.note}</p><ArrowRight className="member-card-arrow" size={16}/></button>})}</section>
            <div className="member-dashboard-columns"><section className="member-section-card"><SectionTitle icon={ArrowRight} title="Quick actions"/><div className="member-quick-actions"><button onClick={()=>navigate('savings')}>Save money <ArrowRight size={15}/></button><button onClick={()=>navigate('loans')}>Apply for a loan <ArrowRight size={15}/></button><button onClick={()=>{setFinanceTab('contributions');navigate('finances')}}>Make a contribution <ArrowRight size={15}/></button><button onClick={()=>{setFinanceTab('history');navigate('finances')}}>View transactions <ArrowRight size={15}/></button></div>{workspace&&!workspace.member&&workspace.applications.length===0&&<div className="member-join-prompt"><strong>Your account is ready.</strong><p>Complete your membership application to become an approved cooperative member.</p><button className="member-primary" onClick={()=>window.location.assign('/?join=1')}>Complete Membership Application <ArrowRight size={15}/></button></div>}{workspace&&workspace.applications.length>0&&!workspace.member&&<div className="member-join-prompt"><strong>Membership application</strong><p>Your application status is {workspace.applications[0].status.replace(/_/g,' ').toLowerCase()}.</p><button className="member-secondary-action" onClick={()=>navigate('applications')}>Track application <ArrowRight size={15}/></button></div>}</section><section className="member-section-card"><SectionTitle icon={Bell} title="Notifications" action="View all" onAction={()=>navigate('notifications')}/>{notifications.slice(0,3).map(item=><button className={`member-notice-row ${item.read_at?'':'unread'}`} key={item.id} onClick={()=>{navigate('notifications');if(!item.read_at)void setNotificationRead(item.id)}}><span/><span><strong>{item.title}</strong><small>{item.body}</small></span><time>{new Date(item.created_at).toLocaleDateString('en-KE')}</time></button>)}{!notifications.length&&<EmptyState title="Youâ€™re all caught up" body="Your latest cooperative updates appear here."/>}</section><section className="member-section-card member-dashboard-activity"><SectionTitle icon={Activity} title="Recent activity" action="View all" onAction={()=>navigate('finances')}/>{verifiedFinancialItems.slice(0,4).map(item=><article className="member-record-row" key={item.id}><div><strong>{item.label}</strong><small>{new Date(item.date).toLocaleDateString('en-KE')}</small></div><span className="member-finance-status">{item.status.replace(/_/g,' ')}</span><strong>{money(item.amount)}</strong></article>)}{!verifiedFinancialItems.length&&<EmptyState title="No recent activity" body="Confirmed financial records will appear here."/>}</section></div>
          </>}
          {page==='account'&&<section className="member-section-card"><SectionTitle icon={UserRound} title="Account overview"/><p className="member-section-intro">Your membership information, applications, personal details and security settings are together in Profile.</p><button className="member-primary" onClick={()=>navigate('profile')}>Go to Profile <ArrowRight size={15}/></button></section>}
          {page==='groups'&&<section className="member-section-card member-groups-card"><SectionTitle icon={UsersRound} title="Your group account"/><p className="member-section-intro">Chama records use a separate workspace, account and approval process. Your personal savings and transactions stay separate.</p><div className="member-group-actions"><a className="member-primary" href="/chama">Open My Groups <ArrowRight size={16}/></a></div><small>Register a Chama, join with an invitation code, or view a group where you are an active member.</small></section>}
          {page==='membership'&&<MembershipPage workspace={workspace} regionName={regionName} onApply={()=>window.location.assign('/?join=1')} onApplications={()=>navigate('applications')}/>}
          {page==='applications'&&<section className="member-section-card"><SectionTitle icon={ClipboardList} title="Application history"/><p className="member-section-intro">Track cooperative review updates here. Membership is only active after an authorized approval.</p>{workspace?.applications.length?<div className="member-application-list">{workspace.applications.map(app=><ApplicationRow key={app.id} app={app}/>)}</div>:<EmptyState title="No applications yet" body="Start a membership application to begin the cooperative review process." action="Start an application" onAction={()=>window.location.assign('/?join=1')}/>}<div className="member-info-banner"><FileText size={18}/><p>Application submission and document upload options are managed through the secure membership form. Follow any requests for additional information in notifications.</p></div></section>}
          {page==='finances'&&<FinancialPage items={verifiedFinancialItems} data={financial} activeTab={financeTab} onTab={setFinanceTab}/>}
          {page==='loans'&&<MemberLoans session={session} memberId={workspace?.member?.id??null} supportEligible={workspace?.contributions.assistance_eligible??null}/>}
          {page==='investments'&&<InvestmentsPage userId={session.user.id}/>}
          {page==='savings'&&<SavingsPage data={financial} session={session} memberId={workspace?.member?.id??null}/>}
          {page==='life'&&<LifeBenefitsPage onNavigate={navigate}/>}
          {page==='planner'&&<MemberLifeHub session={session} memberId={workspace?.member?.id??null} module="planner"/>}
          {page==='family-goals'&&<MemberLifeHub session={session} memberId={workspace?.member?.id??null} module="family-goals"/>}
          {page==='services'&&<MemberLifeHub session={session} memberId={workspace?.member?.id??null} module="services"/>}
          {page==='opportunities'&&<MemberLifeHub session={session} memberId={workspace?.member?.id??null} module="opportunities"/>}
          {page==='marketplace'&&<MemberLifeHub session={session} memberId={workspace?.member?.id??null} module="marketplace"/>}
          {page==='community'&&<MemberLifeHub session={session} memberId={workspace?.member?.id??null} module="community"/>}
          {page==='help'&&<MemberLifeHub session={session} memberId={workspace?.member?.id??null} module="help"/>}
          {page==='notifications'&&<section className="member-section-card"><div className="member-section-title-row"><SectionTitle icon={Bell} title="Notification centre"/><button className="member-text-action" onClick={()=>void setNotificationRead()} disabled={!unread||busy}><Check size={15}/> Mark all read</button></div>{notifications.map(item=><article className={`member-notification ${item.read_at?'':'unread'}`} key={item.id}><span className="member-notification-dot"/><div><strong>{item.title}</strong><p>{item.body}</p><time>{new Date(item.created_at).toLocaleString('en-KE')}</time></div>{!item.read_at&&<button className="member-text-action" onClick={()=>void setNotificationRead(item.id)} disabled={busy}>Mark read</button>}</article>)}{!notifications.length&&<EmptyState title="No notifications yet" body="Application decisions, payment updates and cooperative announcements will show here."/>}</section>}
          {page==='profile'&&<ProfilePage profile={profile} email={session.user.email??''} userId={session.user.id} member={workspace?.member??null} onSubmit={updateProfile} busy={busy} onNavigate={navigate}/>}
          {page==='settings'&&<div className="member-settings-grid"><section className="member-section-card"><SectionTitle icon={ShieldCheck} title="Security"/><p className="member-section-intro">Update your account password. You may be asked to sign in again after a security change.</p><form className="member-profile-form" onSubmit={event=>void changePassword(event)}><label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} required/></label><label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} required/></label>{passwordMessage&&<p className={passwordMessage.includes('successfully')?'member-success':'member-error'} role="status">{passwordMessage}</p>}<button className="member-primary" disabled={busy}>Update password</button></form></section><section className="member-section-card"><SectionTitle icon={Bell} title="Notification preferences"/><p className="member-section-intro">Notifications are currently delivered to your in-app inbox. Email and SMS preference controls are unavailable until the cooperative enables those channels.</p><button className="member-secondary-action" onClick={()=>navigate('notifications')}>Open notification centre{unread>0?` (${unread})`:''} <ArrowRight size={15}/></button></section><section className="member-section-card"><SectionTitle icon={Download} title="Install app"/><p className="member-section-intro">Add Jamii Yangu to your device for quicker access.</p><button className="member-secondary-action" onClick={()=>void installApp()} disabled={appInstalled}>{appInstalled?'App installed':'Install app'} <ArrowRight size={15}/></button>{installMessage&&<p className="member-section-intro" role="status">{installMessage}</p>}</section><section className="member-section-card"><SectionTitle icon={LogOut} title="Sign out"/><p className="member-section-intro">End your secure session on this device.</p><button className="member-secondary-action" onClick={()=>void signOut()} disabled={busy}>Sign out of Jamii Yangu <LogOut size={15}/></button></section></div>}
        </>}
      </main>
    </div>
    {session&&<nav className="member-bottom-nav" aria-label="Quick navigation">{primaryNav.filter(item=>item.key!=='groups'||Boolean(workspace?.member)).map(item=>{const Icon=item.icon;const active=page===item.key||(item.key==='account'&&['membership','profile','settings','notifications'].includes(page))||(item.key==='savings'&&page==='finances');return item.key==='groups'?<a key={item.key} href="/chama" className={active?'active':''}><Icon size={19}/><span>{item.label}</span></a>:<button key={item.key} type="button" className={active?'active':''} onClick={()=>navigate(item.key)}><Icon size={19}/><span>{item.label}</span></button>})}<button type="button" className={isMorePage(page)?'active':''} onClick={()=>{setMoreOpen(true);setMenuOpen(true)}}><Menu size={19}/><span>More</span></button></nav>}
    <footer className="member-footer"><span>I grow, we grow, community grows.</span><span>Jamii Yangu Group Cooperative</span><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></footer>
  </div>
}

const pageDescriptions:Record<Page,string>={dashboard:'Your verified savings, membership and recent activity.',account:'Account access and workspace overview.',groups:'Your Chama account and group financial records.',membership:'Your cooperative membership status and review progress.',applications:'Review your submitted membership applications and status updates.',finances:'Verified cooperative records associated with your member account.',loans:'Loans and support requests, subject to cooperative review.',investments:'Your cooperative investment positions and authorized products.',savings:'Your recorded cooperative savings and separate personal savings targets.',life:'Personal planning and cooperative services in one place.',planner:'A private monthly planner. Personal entries are not cooperative transactions.', 'family-goals':'Private household goals and planning.',services:'Verified provider information and current cooperative offers.',opportunities:'Opportunities published by authorized cooperative reviewers.',marketplace:'Approved member businesses and published listings.',community:'Current notices published by the cooperative.',notifications:'Application, financial and cooperative updates for your account.',help:'Send and track private support requests.',profile:'Manage your membership, applications, contact details and account settings.',settings:'Manage your account security and preferences.'}

function SectionTitle({icon:Icon,title,action,onAction}:{icon:typeof Home;title:string;action?:string;onAction?:()=>void}){return <div className="member-section-heading"><div><span><Icon size={18}/></span><h2>{title}</h2></div>{action&&<button className="member-text-action" onClick={onAction}>{action}<ArrowRight size={14}/></button>}</div>}
function EmptyState({title,body,action,onAction}:{title:string;body:string;action?:string;onAction?:()=>void}){return <div className="member-empty-state"><span><Activity size={19}/></span><strong>{title}</strong><p>{body}</p>{action&&<button className="member-secondary-action" onClick={onAction}>{action}<ArrowRight size={15}/></button>}</div>}
function LifeBenefitsPage({onNavigate}:{onNavigate:(page:Page)=>void}){const planning:{page:Page;title:string;description:string;icon:typeof Wallet}[]=[{page:'planner',title:'Monthly budget',description:'Plan personal income and expenses.',icon:Wallet},{page:'savings',title:'Savings goals',description:'Set personal savings targets; no funds are moved.',icon:PiggyBank},{page:'family-goals',title:'Family goals',description:'Plan household goals privately.',icon:UsersRound}];const community:{page:Page;title:string;description:string;icon:typeof Home}[]=[{page:'services',title:'Verified services & offers',description:'Browse cooperative verified providers and offers.',icon:Building2},{page:'opportunities',title:'Opportunities',description:'View opportunities shared with members.',icon:BriefcaseBusiness},{page:'marketplace',title:'Marketplace',description:'Browse member marketplace listings.',icon:ShoppingBag},{page:'community',title:'Community updates',description:'Read cooperative announcements.',icon:UsersRound},{page:'help',title:'Help centre',description:'Send a private support request.',icon:LifeBuoy}];const cards=(items:typeof planning)=><div className="member-benefit-grid">{items.map(({page,title,description,icon:Icon})=><button className="member-benefit-card" key={page} onClick={()=>onNavigate(page)}><span><Icon size={19}/></span><strong>{title}</strong><small>{description}</small><ArrowRight size={15}/></button>)}</div>;return <div className="member-life-groups"><section className="member-section-card"><SectionTitle icon={Wallet} title="Personal planning"/>{cards(planning)}<p className="member-section-intro">Personal planning is private and separate from official cooperative balances and transactions.</p></section><section className="member-section-card"><SectionTitle icon={UsersRound} title="Community services"/>{cards(community)}</section></div>}
function ApplicationRow({app}:{app:MemberWorkspaceData['applications'][number]}){const stages=['SUBMITTED','UNDER_REVIEW','FORWARDED','APPROVED'];const active=app.status==='REJECTED'?1:Math.max(1,stages.indexOf(app.status)+1);return <article className="member-application-row"><div className="member-application-main"><span className={`member-application-state ${app.status.toLowerCase()}`}>{app.status.replace(/_/g,' ')}</span><small>Submitted {new Date(app.created_at).toLocaleDateString('en-KE')} · Registration payment {app.payment_status.replace(/_/g,' ')}</small>{app.payment_status==='UNPAID'&&<small>Fee due: {app.registration_fee_kes==null?'Confirm with member support':money(app.registration_fee_kes)}. Payment must be verified by Finance.</small>}{app.monthly_contribution_agreed_kes!=null&&<small>Monthly contribution agreement: {money(app.monthly_contribution_agreed_kes)} per month.</small>}<div className="member-progress" aria-label={`Application step ${active} of 4`}>{stages.map((stage,index)=><i key={stage} className={index<active?'complete':''}/>)}</div><small>{app.status==='REJECTED'?'Decision recorded':app.status==='MORE_INFORMATION_REQUIRED'?'Additional information requested':app.status==='APPROVED'?'Membership approved':'Cooperative review in progress'}</small></div></article>}
function MembershipPage({workspace,regionName,onApply,onApplications}:{workspace:MemberWorkspaceData|null;regionName:string|null;onApply:()=>void;onApplications:()=>void}){const member=workspace?.member;const applications=workspace?.applications??[];return <div className="member-module-grid"><section className="member-section-card member-membership-card"><SectionTitle icon={BadgeCheck} title="Membership status"/><div className={`member-membership-status ${member?.status.toLowerCase()??'pending'}`}><span/><strong>{member?member.status.replace(/_/g,' '):applications.length?applications[0].status.replace(/_/g,' '):'Not yet approved'}</strong></div>{member?<dl className="member-details"><div><dt>Member number</dt><dd>{member.membership_number}</dd></div><div><dt>County</dt><dd>{member.county}</dd></div><div><dt>Region</dt><dd>{regionName??'Not configured'}</dd></div><div><dt>Branch</dt><dd>{member.branch??'Not assigned'}</dd></div><div><dt>Approved on</dt><dd>{new Date(member.approved_at).toLocaleDateString('en-KE')}</dd></div></dl>:applications.length?<p className="member-section-intro">Your account is ready. Your membership application is {applications[0].status.replace(/_/g,' ').toLowerCase()}. Track its progress here.</p>:<><p className="member-section-intro">Your account is ready. Complete your membership application to become an approved cooperative member.</p><button className="member-primary" onClick={onApply}>Complete Membership Application <ArrowRight size={15}/></button></>}{applications.length>0&&<div className="member-membership-actions"><button className="member-secondary-action" onClick={onApplications}>Track application <ArrowRight size={15}/></button></div>}</section><section className="member-section-card"><SectionTitle icon={ClipboardList} title="Application progress"/>{applications.length?applications.map(app=><ApplicationRow app={app} key={app.id}/>):<EmptyState title="No application yet" body="Complete the membership application to start cooperative review." action="Complete Membership Application" onAction={onApply}/>}</section>{member&&<section className="member-section-card"><SectionTitle icon={Landmark} title="Membership details"/><p className="member-section-intro">Your membership is approved and linked to this account.</p><button className="member-secondary-action" onClick={()=>window.location.hash='profile'}>View personal information <ArrowRight size={15}/></button></section>}</div>}
function FinancialPage({items,data,activeTab,onTab}:{items:{id:string;label:string;type:string;amount:number;status:string;date:string;reference:string}[];data:FinancialData|null;activeTab:'overview'|'contributions'|'payments'|'statements'|'history';onTab:(tab:'overview'|'contributions'|'payments'|'statements'|'history')=>void}){const tabs=[['overview','Overview'],['contributions','Contributions'],['payments','Payments'],['statements','Statements'],['history','Transaction history']] as const;const visible=activeTab==='payments'?items.filter(item=>item.type==='payment'):activeTab==='contributions'?items.filter(item=>item.type==='contribution'):items;const total=data?.contributions.reduce((sum,item)=>sum+(item.status==='VERIFIED'?Number(item.amount_kes):0),0)??0;return <section className="member-section-card"><div className="member-finance-summary"><div><small>Verified contributions</small><strong>{money(total)}</strong></div><div><small>Verified transactions</small><strong>{items.filter(item=>item.status==='VERIFIED').length}</strong></div><div><small>Records shown</small><strong>{items.length}</strong></div></div><nav className="member-subnav" aria-label="Financial records">{tabs.map(([key,label])=><button key={key} onClick={()=>onTab(key)} className={activeTab===key?'active':''}>{label}</button>)}</nav>{activeTab==='statements'&&<div className="member-info-banner"><FileText size={18}/><p>Statement downloads are not configured yet. Your verified records are available in the transaction history below.</p></div>}{activeTab==='overview'&&<p className="member-section-intro">Only verified cooperative contributions and recorded member activity are included. Pending payments and personal budget entries are not included as completed cooperative transactions.</p>}{visible.length?<div className="member-transaction-list">{visible.map(item=><article key={item.id}><span className="member-transaction-icon"><ArrowDownLeft size={17}/></span><div><strong>{item.label}</strong><small>Ref {item.reference.slice(0,12)} Â· {new Date(item.date).toLocaleDateString('en-KE')}</small></div><span className={`member-finance-status ${item.status.toLowerCase()}`}>{item.status.replace(/_/g,' ')}</span><strong>{money(item.amount)}</strong></article>)}</div>:<EmptyState title={data?'No verified records yet':'Financial records are unavailable'} body={data?'Verified transactions will appear here once recorded to your member account.':'We could not retrieve the finance records. Refresh or contact member support.'}/>}</section>}
function InvestmentsPage({userId}:{userId:string}){
  const [positions,setPositions]=useState<{id:string;amount_kes:number;status:string;created_at:string;project_name:string}[]>([])
  const [products,setProducts]=useState<{id:string;name:string;category:string;description:string;risk_disclosure:string;minimum_investment_kes:number|null;status:string}[]>([])
  useEffect(()=>{if(!supabase)return;void (async()=>{
    const [records,projects]=await Promise.all([
      supabase.from('investment_records').select('id,project_id,amount_kes,status,created_at').eq('investor_user_id',userId).eq('status','ACTIVE').order('created_at',{ascending:false}),
      supabase.from('investment_projects').select('id,name,category,description,risk_disclosure,minimum_investment_kes,status').in('status',['APPROVED','OPEN']).order('name'),
    ])
    const recordRows=records.data??[],projectMap=new Map((projects.data??[]).map(project=>[project.id,project.name]))
    setPositions(recordRows.map(item=>({id:item.id,amount_kes:item.amount_kes,status:item.status,created_at:item.created_at,project_name:projectMap.get(item.project_id)??'Investment project'})))
    setProducts((projects.data??[]) as typeof products)
  })()},[userId])
  return <div className="member-module-grid"><section className="member-section-card"><SectionTitle icon={TrendingUp} title="My investment positions"/><p className="member-big-value">{positions.length}</p>{positions.map(item=><article className="member-record-row" key={item.id}><div><strong>{item.project_name}</strong><small>{money(item.amount_kes)} Â· {new Date(item.created_at).toLocaleDateString('en-KE')}</small></div><span className="member-finance-status">Approved</span></article>)}{!positions.length&&<p className="member-section-intro">No approved investments are recorded for your account.</p>}</section><section className="member-section-card"><SectionTitle icon={Landmark} title="Approved investment products"/>{products.map(product=><article className="member-record-row" key={product.id}><div><strong>{product.name}</strong><small>{product.category} Â· {product.minimum_investment_kes?`Minimum ${money(product.minimum_investment_kes)}`:'Minimum not specified'}</small><p>{product.description}</p><small>Risk disclosure: {product.risk_disclosure}</small></div></article>)}{!products.length&&<EmptyState title="No approved products displayed" body="The cooperative has not published investment products in the member portal."/>}</section><section className="member-section-card"><SectionTitle icon={FileText} title="Investment history"/><p className="member-section-intro">Approved investment positions are listed above. No investment returns are calculated here.</p></section></div>
}
function SavingsPage({data,session,memberId}:{data:FinancialData|null;session:Session;memberId:string|null}){return <MemberLifeHub session={session} memberId={memberId} module="savings" cooperativeSavings={data?.savings??null}/>}
function ProfilePage({profile,email,userId,member,onSubmit,busy,onNavigate}:{profile:Profile|null;email:string;userId:string;member:MemberWorkspaceData['member'];onSubmit:(event:FormEvent<HTMLFormElement>)=>void;busy:boolean;onNavigate:(page:Page)=>void}){
  const [showPersonalDetails,setShowPersonalDetails]=useState(false)
  return <div className="member-profile-page"><section className="member-section-card member-profile-links"><SectionTitle icon={UserRound} title="Your profile & account"/><p className="member-section-intro">Manage your cooperative membership, applications, personal information and account security here.</p><div className="member-profile-link-grid"><button className="member-hub-link" onClick={()=>onNavigate('membership')}><BadgeCheck size={18}/><span><strong>Membership details</strong><small>Membership number, status and branch</small></span><ArrowRight size={16}/></button><button className="member-hub-link" onClick={()=>onNavigate('applications')}><ClipboardList size={18}/><span><strong>Applications</strong><small>Track applications and review requests</small></span><ArrowRight size={16}/></button><button className="member-hub-link" aria-expanded={showPersonalDetails} aria-controls="member-personal-details" onClick={()=>setShowPersonalDetails(open=>!open)}><UserRound size={18}/><span><strong>Personal details</strong><small>{showPersonalDetails?'Hide your details':'Update your phone number and profile'}</small></span><ArrowRight size={16}/></button><button className="member-hub-link" onClick={()=>onNavigate('settings')}><ShieldCheck size={18}/><span><strong>Security & settings</strong><small>Password and notification settings</small></span><ArrowRight size={16}/></button><button className="member-hub-link" onClick={()=>onNavigate('notifications')}><Bell size={18}/><span><strong>Notifications</strong><small>View cooperative updates</small></span><ArrowRight size={16}/></button></div></section><ProfilePhoto userId={userId} memberId={member?.id??null}/>{showPersonalDetails&&<section className="member-section-card" id="member-personal-details"><SectionTitle icon={UserRound} title="Personal details"/><form className="member-profile-form" onSubmit={onSubmit}><label>Full name<input name="display_name" defaultValue={profile?.display_name??''} maxLength={160} autoComplete="name" required/></label><label>Email address<input value={email} readOnly aria-describedby="member-email-note"/></label><small id="member-email-note">Email changes require verified account confirmation and are not available in this profile form.</small><label>Phone number<input name="phone_number" type="tel" defaultValue={profile?.phone_number??''} maxLength={20} pattern="[+]?[0-9 ()-]{9,20}" autoComplete="tel" required/></label><button className="member-primary" disabled={busy}>Save profile <Check size={15}/></button></form></section>}</div>
}
function ProfilePhoto({userId,memberId}:{userId:string;memberId:string|null}){
  const [photoUrl,setPhotoUrl]=useState('')
  const [photoError,setPhotoError]=useState('')
  const [photoBusy,setPhotoBusy]=useState(false)
  const loadPhoto=useCallback(async()=>{
    if(!supabase)return
    const {data:document,error:documentError}=await supabase.from('private_documents').select('id').eq('owner_user_id',userId).eq('category','PROFILE_PHOTO').order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(documentError){setPhotoError('Profile photo could not be loaded.');return}
    if(!document){setPhotoUrl('');return}
    const {data,error:linkError}=await supabase.functions.invoke('create-document-download',{body:{documentId:document.id}})
    if(linkError||!data?.signedUrl){setPhotoError('A secure photo link could not be created.');return}
    setPhotoError('');setPhotoUrl(data.signedUrl)
  },[userId])
  useEffect(()=>{void loadPhoto();const timer=window.setInterval(()=>void loadPhoto(),45000);return()=>window.clearInterval(timer)},[loadPhoto])
  async function uploadPhoto(event:ChangeEvent<HTMLInputElement>){
    const input=event.currentTarget,file=input.files?.[0]
    if(!file)return
    if(!['image/jpeg','image/png'].includes(file.type)||file.size<1||file.size>5*1024*1024){setPhotoError('Choose a JPEG or PNG photo smaller than 5 MB.');input.value='';return}
    if(!supabase){setPhotoError('Photo uploads are unavailable right now.');input.value='';return}
    const form=new FormData();form.append('file',file);form.append('category','PROFILE_PHOTO');if(memberId)form.append('memberId',memberId)
    setPhotoBusy(true);setPhotoError('')
    const {error:uploadError}=await supabase.functions.invoke('upload-private-document',{body:form})
    setPhotoBusy(false);input.value=''
    if(uploadError){setPhotoError('The private profile photo upload failed. Please try again.');return}
    await loadPhoto()
  }
  return <section className="member-section-card member-profile-photo-card"><div className="member-profile-photo-preview">{photoUrl?<img src={photoUrl} alt="Your profile"/>:<span><UserRound size={25}/></span>}<div><strong>Profile photo</strong><small>Private to your account � JPEG or PNG, up to 5 MB</small></div><label className="member-photo-upload"><Camera size={15}/>{photoBusy?'Uploading�':photoUrl?'Change photo':'Add photo'}<input type="file" accept="image/jpeg,image/png" onChange={event=>void uploadPhoto(event)} disabled={photoBusy}/></label></div>{photoError&&<p className="member-profile-photo-error" role="status">{photoError}</p>}</section>
}
