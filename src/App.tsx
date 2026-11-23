import { ArrowDown, ArrowRight, ArrowUpRight, Banknote, ChartNoAxesCombined, HandCoins, Menu, ShieldCheck, X, HeartHandshake, GraduationCap, Store, BriefcaseBusiness, Wallet, HeartPulse } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import Logo from './components/Logo'
import MembershipDialog from './components/MembershipDialog'
import MemberPortal from './components/MemberPortal'
import StaffPortal from './components/StaffPortal'
import ChamaPortal from './components/ChamaPortal'
import JourneyVisual from './components/JourneyVisual'
import BenefitOrbitVisual from './components/BenefitOrbitVisual'

const GlobeVisual = lazy(() => import('./components/GlobeVisual'))

const services = [
  { icon: Banknote, title: 'Save with purpose', body: 'Build a steady savings habit, plan monthly priorities and set personal targets. The member planner is private and does not move or hold money.' },
  { icon: HandCoins, title: 'Responsible financial support', body: 'Where applications are available, members can request support for authorized review. Eligibility, terms and approval apply; requests are not guaranteed.' },
  { icon: ChartNoAxesCombined, title: 'Grow through opportunity', body: 'Explore published business, learning and community opportunities, with clear eligibility information and next steps where provided.' },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [compactNav, setCompactNav] = useState(() => window.innerWidth <= 1180)
  const [scrolled, setScrolled] = useState(false)
  const [showForm, setShowForm] = useState(() => new URLSearchParams(window.location.search).get('join') === '1')
  const [formMode, setFormMode] = useState<'signup' | 'signin'>('signup')
  const openForm = (mode: 'signup' | 'signin') => { setFormMode(mode); setShowForm(true) }
  const closeMenu = () => setMenuOpen(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll()
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target) } }), { threshold: .12 })
    document.querySelectorAll('.reveal').forEach((item) => observer.observe(item))
    return () => { window.removeEventListener('scroll', onScroll); observer.disconnect() }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  useEffect(() => {
    const updateLayout = () => {
      const compact = window.innerWidth <= 1180
      setCompactNav(compact)
      if (!compact) setMenuOpen(false)
    }
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  if (window.location.pathname.startsWith('/staff')) return <StaffPortal />
  if (window.location.pathname.startsWith('/member')) return <MemberPortal />
  if (window.location.pathname.startsWith('/chama')) return <ChamaPortal />

  return <>
    <header className={`topbar ${scrolled ? 'topbar-scrolled' : ''}`}>
      <div className="topbar-inner">
        <Logo />
        <button className="menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        {menuOpen && <button className="nav-scrim" type="button" aria-label="Close navigation" onClick={closeMenu} />}
        <nav id="main-navigation" className={menuOpen ? 'nav nav-open' : 'nav'} aria-label="Main navigation" aria-hidden={compactNav && !menuOpen}>
          <a href="#home" onClick={closeMenu}>Home</a><a href="#about" onClick={closeMenu}>About</a>
          <details className="nav-dropdown"><summary>Services <span>⌄</span></summary><div className="nav-menu"><a href="#services" onClick={closeMenu}><strong>Savings and planning</strong><small>Build savings habits and set personal goals.</small></a><a href="#services" onClick={closeMenu}><strong>Financial support</strong><small>Review eligibility and application information.</small></a><a href="/member" onClick={closeMenu}><strong>Verified essential services</strong><small>Browse provider listings when available.</small></a></div></details>
          <a href="#opportunities" onClick={closeMenu}>Opportunities</a><a href="/chama" onClick={closeMenu}>For Chamas</a><a href="#contact" onClick={closeMenu}>Contact</a>
          <details className="nav-dropdown nav-more"><summary>Explore <span>⌄</span></summary><div className="nav-menu"><a href="#how" onClick={closeMenu}><strong>How to become a member</strong><small>Create an account, verify your email and apply for review.</small></a><a href="#benefits" onClick={closeMenu}><strong>Member benefits</strong><small>Explore planning tools and published partner services.</small></a><a href="/member" onClick={closeMenu}><strong>Member marketplace</strong><small>Discover member listings in your workspace.</small></a><a href="#faqs" onClick={closeMenu}><strong>Frequently asked questions</strong><small>Read answers about accounts and cooperative services.</small></a><a href="/privacy.html" onClick={closeMenu}><strong>Privacy notice</strong><small>How account and application details are handled.</small></a></div></details>
          <button className="button button-outline nav-login" onClick={() => { openForm('signin'); closeMenu() }}>Sign in <ArrowUpRight size={15} /></button><button className="button button-primary nav-join" onClick={() => { openForm('signup'); closeMenu() }}>Become a member</button>
        </nav>
      </div>
    </header>

    <main>
      <section className="hero" id="home">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A cooperative built around you</div>
          <h1>Together, We Build<br /><em>Better Lives.</em></h1>
          <p className="hero-description">More than a cooperative. A community creating opportunities, financial empowerment and a better future for every member.</p>
          <div className="hero-actions"><button className="button button-primary" onClick={() => openForm('signup') }>Become a Member <ArrowRight size={17} /></button><a className="text-link" href="#benefits">Explore Member Benefits <ArrowDown size={15} /></a></div>
          <div className="trust-note"><ShieldCheck size={17} /><span>Built on transparency, shared progress and member participation</span></div>
        </div>
        <div className="hero-art cinematic-art" aria-label="Jamii Yangu cooperative emblem and community">
          <Suspense fallback={<div className="globe-lazy-fallback" aria-label="Loading Earth" />}><GlobeVisual /></Suspense>
        </div>
        <a className="scroll-cue" href="#about" aria-label="Scroll to learn about Jamii Yangu"><span/>SCROLL TO EXPLORE</a><div className="hero-bottom"><span>ROOTED IN COMMUNITY</span><span className="bottom-line"/><span>GROWING WITH PURPOSE</span></div>
      </section>

      <section className="promise-strip" id="about"><div className="promise-mark">“</div><p><strong>I grow, we grow, community grows.</strong><span>Every member's progress adds strength to all of us.</span></p><a href="#how" aria-label="Learn about the cooperative"><ArrowRight size={20}/></a></section>

      <section className="about-premium reveal"><div><div className="eyebrow"><span className="eyebrow-dot"/> ABOUT JAMII YANGU</div><h2>One Community.<br/><em>Many Opportunities.</em></h2><p>Jamii Yangu is a member-centered cooperative bringing people together to build financial habits, pursue shared opportunities and strengthen household wellbeing. The platform combines a secure membership application with private planning tools and directories for services that have been reviewed for publication.</p><p>Members can follow their application, plan a household budget, set savings goals, discover published opportunities and contact support. Financial assistance, payments and partner services remain subject to eligibility, cooperative approval and availability.</p><a className="text-link" href="#how">How membership works <ArrowRight size={15}/></a></div><figure className="about-media"><video autoPlay muted loop controls playsInline preload="metadata" poster="/jamii-yangu-founder.jpeg" aria-label="Community video introducing Jamii Yangu"><source src="/jamii-yangu-community.mp4" type="video/mp4"/>Your browser does not support embedded video.</video><figcaption>Growing together starts with people.</figcaption></figure></section>

      <section className="services section-wrap" id="services">
        <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> YOUR NEXT CHAPTER</div><h2>Good things grow<br/>from a strong <em>foundation.</em></h2></div><p>Practical financial services and shared opportunities, shaped around the people who make this community what it is.</p></div>
        <div className="service-grid">{services.map(({icon: Icon, title, body}, i) => <article className="service-card" key={title}><div className="service-top"><span className="service-icon"><Icon size={21}/></span><span className="service-number">0{i + 1}</span></div><h3>{title}</h3><p>{body}</p><a href="#contact" aria-label={`Learn more: ${title}`}><ArrowUpRight size={17}/></a></article>)}</div>
      </section>

      <section className="benefits-section reveal" id="benefits"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> MORE FOR MEMBERS</div><h2>Membership That Adds<br/><em>Value to Your Life.</em></h2></div><p>Explore practical tools and partner opportunities as they are verified and published.</p></div><BenefitOrbitVisual/><div className="benefit-grid">{[[Store,'Member marketplace','Create a reviewed listing so members can discover your products or services and contact your business.'],[HeartPulse,'Health services','Browse provider information and member discounts after the cooperative verifies and publishes them.'],[BriefcaseBusiness,'Jobs and training','Review published jobs, internships and training, including the eligibility details supplied with each listing.'],[GraduationCap,'Education support','Explore education opportunities when reviewed listings are available, and check deadlines before applying.'],[Wallet,'Family planning','Plan budgets, savings targets and family expenses in private tools that do not hold or transfer funds.'],[HeartHandshake,'Community programmes','Read current cooperative updates and use the member Help Centre to ask questions or raise a concern.']].map(([Icon,title,description],i)=><a className="benefit-card" href={i===0?'#marketplace':i===2||i===3?'#opportunities':'/member'} key={String(title)}><span><Icon size={21}/></span><h3>{String(title)}</h3><p>{String(description)}</p><ArrowUpRight size={16}/></a>)}</div></section>

      <section className="how-section reveal" id="how"><div className="how-inner"><JourneyVisual/><div className="how-copy"><div className="eyebrow"><span className="eyebrow-dot"/> SIMPLE BY DESIGN</div><h2>A shared journey,<br/>with <em>you at the heart.</em></h2><p>Membership follows a clear process, from creating an account through cooperative review. Your dashboard shows your application status, and approved services become available according to their requirements.</p><div className="how-steps"><div><b>01</b><span><strong>Create your account</strong><small>Register with your email and verify it.</small></span></div><div><b>02</b><span><strong>Complete membership registration</strong><small>Submit your details for cooperative review.</small></span></div><div><b>03</b><span><strong>Verify your membership</strong><small>Follow the review status in your account.</small></span></div><div><b>04</b><span><strong>Access available services</strong><small>Explore services when you are approved and eligible.</small></span></div></div><button className="button button-primary" onClick={() => openForm('signup') }>Start your application <ArrowRight size={17}/></button></div></div></section>

      <section className="opportunities-section reveal" id="opportunities"><div><div className="eyebrow"><span className="eyebrow-dot"/> GROW YOUR NEXT CHAPTER</div><h2>Opportunities for<br/><em>what comes next.</em></h2><p>Members can view verified jobs, internships, scholarships, bursaries, business opportunities and training in their secure workspace.</p><a className="button button-primary" href="/member">View member opportunities <ArrowRight size={16}/></a></div><div className="opportunity-art"><img src="/jamii-yangu-emblem.png" alt="Jamii Yangu emblem"/><span>Published opportunities appear in the member workspace after review.</span></div></section>
      <div id="marketplace" className="anchor-marker" aria-hidden="true"/>

      <section className="community-cta reveal"><video className="community-background-video" autoPlay muted loop playsInline preload="none" poster="/jamii-yangu-founder.jpeg" aria-hidden="true"><source src="/jamii-yangu-community.mp4" type="video/mp4"/></video><div className="community-cta-content"><div className="eyebrow">A COMMUNITY BUILT ON SHARED POSSIBILITY</div><h2>Your Growth Strengthens<br/>the Community.</h2><p>Build savings habits, grow a business, support your family and take part in community development at your pace.</p></div><button className="button button-light" onClick={() => openForm('signup') }>Your journey starts here <ArrowRight size={17}/></button></section>

      <section className="faq-section reveal" id="faqs"><div className="eyebrow"><span className="eyebrow-dot"/> FREQUENTLY ASKED QUESTIONS</div><h2>Good to know.</h2><p className="faq-intro">Clear information helps members make informed choices. These answers describe the current website flow; always review the cooperative’s approved terms and any service-specific conditions before applying.</p>{[
        ['What is Jamii Yangu?','Jamii Yangu Group Cooperative is a member-centered community focused on financial discipline, shared opportunities and practical support. The website provides a secure account and membership application flow, a private member workspace, personal planning tools, a support centre and directories for verified services and published opportunities. A website account alone does not make someone an approved cooperative member or guarantee access to a financial product.'],
        ['How do I become a member?','Start by creating an account with your email address and a secure password. Confirm your email using the verification link, then sign in and complete the membership application with your personal details and county information. The cooperative reviews each application, and you can track its status in your workspace. Submitting an application is a request for review; membership begins only after the cooperative completes its approval process and confirms the next steps.'],
        ['What is the registration fee?','Any approved registration fee and official payment instructions will be communicated by the cooperative. This website currently does not collect application fees. Confirm the approved amount and payment arrangements through an authorized cooperative channel before paying. Payment verification and membership approval are separate steps.'],
        ['What are monthly savings contributions?','Contribution amounts and payment arrangements must follow the cooperative’s approved rules. This website does not publish a contribution amount until an approved policy is configured. The personal budget planner is for your own planning and does not record or prove a cooperative contribution. Only contributions recorded and verified by the cooperative count as official member records.'],
        ['How do I access services?','After signing in, open your member workspace and explore the planner, services and offers, opportunities, marketplace, community updates and help centre. Provider listings, discounts, housing opportunities and jobs appear only when they have been reviewed and published. Some financial services may require approved membership, eligibility checks or additional documentation, and availability can vary.'],
        ['How do I apply for financial support?','Sign in and review the assistance or loan options available to your account. Where an application option is enabled, provide complete and accurate information and submit any requested documents through the approved secure process. Eligibility requirements and cooperative review apply; submitting a request does not guarantee approval or payment. The public website does not currently process or disburse financial support payments.'],
        ['How can I contact the cooperative?','If you can sign in, use the Help Centre in your member workspace to submit a private question or complaint and track its status. For account access problems, use the password reset option on the sign-in form. Verified public telephone, email and office details have not been configured on this website yet, so do not rely on guessed contact information.']
      ].map(([question,answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</section>

      <section className="closing-cta" id="contact"><div><div className="eyebrow"><span className="eyebrow-dot"/> THERE'S ROOM TO GROW</div><h2>It starts with <em>us.</em></h2><p>Every strong community starts with people willing to take the first step.</p></div><button className="button button-light" onClick={() => openForm('signup') }>Take your first step <ArrowRight size={17}/></button><div className="cta-sun">✳</div></section>
    </main>

    <footer><div className="footer-main"><Logo/><p>Growing stronger, together.<br/>Built on community and shared possibility.</p><div className="footer-links"><a href="#about">About</a><a href="#services">Financial services</a><a href="#benefits">Member benefits</a><a href="#opportunities">Opportunities</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div><button className="footer-login" onClick={() => openForm('signin') }>Member sign in <ArrowUpRight size={14}/></button></div><div className="footer-bottom"><span>© 2026 Jamii Yangu Group Cooperative</span><span>Member-led. Community-grown.</span></div></footer>

    {showForm && <MembershipDialog key={formMode} initialMode={formMode} onClose={() => setShowForm(false)} />}
  </>
}
