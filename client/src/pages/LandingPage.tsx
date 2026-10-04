import { useEffect, useRef, useState } from 'react';
import { Brand } from '../components/Brand';
import { ActiveUserCount } from '../components/ActiveUserCount';
import { SafetyOrbit } from '../components/SafetyOrbit';
import { Icon } from '../components/Icon';
import {
  CameraMicArtwork,
  MatchArtwork,
  LandingArtwork,
  LandingWaves,
} from '../components/LandingArtwork';
import type { LegalDocument } from '../components/LegalDialog';

const navigation = [
  { id: 'home', label: 'Home' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'safety', label: 'Safety' },
  { id: 'questions', label: 'FAQ' },
] as const;
type SectionId = (typeof navigation)[number]['id'];

const faqs = [
  [
    'Do I need an account?',
    'No. Strangely creates a temporary anonymous session for this browser.',
  ],
  [
    'Can I leave anytime?',
    'Yes. Use End to leave and turn off your camera and microphone, or Next to find someone new.',
  ],
  [
    'How is safety handled?',
    'Use Report or Block during a conversation, and keep personal information private.',
  ],
];

const steps = [
  {
    number: '1',
    title: 'Click Get Started',
    text: 'No sign-up needed.',
    viewBox: '110 556 338 143',
    mobileViewBox: '110 556 338 113',
    icon: 'camera' as const,
  },
  {
    number: '2',
    title: 'Allow Camera & Mic',
    text: 'Enable your camera and microphone.',
    viewBox: '476 556 348 143',
    mobileViewBox: '476 556 348 113',
    icon: 'mic' as const,
  },
  {
    number: '3',
    title: 'Get Matched',
    text: 'We’ll find a random person for you.',
    viewBox: '852 556 348 143',
    mobileViewBox: '852 556 348 113',
    icon: 'globe' as const,
  },
  {
    number: '4',
    title: 'Start the Conversation',
    text: 'Enjoy a live, face-to-face chat.',
    viewBox: '1231 558 331 143',
    mobileViewBox: '1231 558 331 113',
    icon: 'camera' as const,
  },
];

export function LandingPage({
  onStart,
  onLegal,
}: {
  onStart: () => void;
  onLegal: (document: LegalDocument) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const pendingSection = useRef<SectionId | null>(null);
  const mobileNav = useRef<HTMLDetailsElement | null>(null);

  function selectSection(id: SectionId) {
    pendingSection.current = id;
    setActiveSection(id);
    if (mobileNav.current) mobileNav.current.open = false;
  }

  useEffect(() => {
    let frame: number | undefined;
    const updateHeader = () => {
      frame = undefined;
      setScrolled(window.scrollY > 24);
      const activationLine = Math.max(
        110,
        (document.querySelector<HTMLElement>('.site-header')?.offsetHeight ??
          70) + 48,
      );
      let visibleSection: SectionId = 'home';
      for (const section of navigation) {
        if (
          (document.getElementById(section.id)?.getBoundingClientRect().top ??
            Infinity) <= activationLine
        ) {
          visibleSection = section.id;
        }
      }
      // Keep a clicked link highlighted while its smooth scroll travels through
      // earlier sections. Manual scrolling cancels this temporary target.
      if (pendingSection.current && pendingSection.current !== visibleSection)
        return;
      pendingSection.current = null;
      setActiveSection(visibleSection);
    };
    const scheduleUpdate = () => {
      if (frame === undefined)
        frame = window.requestAnimationFrame(updateHeader);
    };
    const interruptScroll = () => {
      pendingSection.current = null;
    };
    const keyboardScroll = (event: KeyboardEvent) => {
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' ',
        ].includes(event.key)
      )
        interruptScroll();
    };
    updateHeader();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('wheel', interruptScroll, { passive: true });
    window.addEventListener('touchmove', interruptScroll, { passive: true });
    window.addEventListener('keydown', keyboardScroll);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('wheel', interruptScroll);
      window.removeEventListener('touchmove', interruptScroll);
      window.removeEventListener('keydown', keyboardScroll);
    };
  }, []);
  return (
    <div id="home" className="landing-page">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="page-container header-content">
          <Brand onNavigate={() => selectSection('home')} />
          <nav className="desktop-nav" aria-label="Main navigation">
            {navigation.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                aria-current={
                  activeSection === section.id ? 'location' : undefined
                }
                onClick={() => selectSection(section.id)}
              >
                {section.label}
              </a>
            ))}
          </nav>
          <button
            className="button button-primary header-cta"
            type="button"
            onClick={onStart}
          >
            <Icon name="camera" /> Get Started
          </button>
          <details className="mobile-nav" ref={mobileNav}>
            <summary aria-label="Open navigation">
              <Icon name="menu" />
            </summary>
            <nav aria-label="Mobile navigation">
              {navigation.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={
                    activeSection === section.id ? 'location' : undefined
                  }
                  onClick={() => selectSection(section.id)}
                >
                  {section.label}
                </a>
              ))}
            </nav>
          </details>
        </div>
      </header>
      <main id="main-content">
        <div className="landing-intro">
          <LandingWaves />
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-art desktop-hero-header-art">
              <LandingArtwork
                viewBox="1025 0 313 76"
                preserveAspectRatio="none"
              />
            </div>
            <div className="hero-art desktop-hero-art">
              <LandingArtwork
                viewBox="690 76 982 467"
                preserveAspectRatio="none"
              />
            </div>
            <div className="hero-art mobile-hero-art">
              <LandingArtwork source="mobile" viewBox="0 0 854 900" />
            </div>
            <div className="page-container hero-content">
              <div className="hero-copy">
                <p className="live-pill">
                  <span /> Live <b>•</b> Random <b>•</b> Real People <b>•</b>{' '}
                  Safety first
                </p>
                <h1 id="hero-title">
                  Meet New People
                  <br />
                  <strong>Face to Face</strong>
                </h1>
                <p className="hero-description">
                  Connect with real people from around the world{' '}
                  <br className="hero-desktop-break" />
                  through live video and audio. No accounts.{' '}
                  <br className="hero-desktop-break" />
                  No pressure. Just real, spontaneous conversations.
                </p>
                <div className="hero-actions">
                  <button
                    className="button button-primary hero-cta"
                    type="button"
                    onClick={onStart}
                  >
                    <Icon name="camera" /> Get Started <Icon name="arrow" />
                  </button>
                  <ActiveUserCount />
                </div>
                <p className="hero-note mobile-hero-note">
                  Real people.
                  <br />
                  Real connections.
                </p>
              </div>
            </div>
          </section>
          <section
            id="how-it-works"
            className="how-section page-container"
            aria-labelledby="how-title"
          >
            <div className="section-heading how-heading">
              <h2 id="how-title">How It Works</h2>
              <p>Start a video chat in seconds. It’s that simple.</p>
            </div>
            <ol className="steps">
              {steps.map((step) => (
                <li key={step.number}>
                  <div className={`step-visual step-${step.number}`}>
                    {step.number === '2' ? (
                      <CameraMicArtwork />
                    ) : step.number === '3' ? (
                      <MatchArtwork />
                    ) : (
                      <>
                        <LandingArtwork
                          viewBox={step.viewBox}
                          className="desktop-step-art"
                        />
                        <LandingArtwork
                          viewBox={step.mobileViewBox}
                          className="mobile-step-art"
                          preserveAspectRatio="none"
                        />
                      </>
                    )}
                    {step.number === '1' && (
                      <div className="phone-brand" aria-hidden="true">
                        <span>
                          <i />
                          <i />
                        </span>
                        <b>Strangely</b>
                      </div>
                    )}
                  </div>
                  <div className="step-badges" aria-hidden="true">
                    <span className="step-number">{step.number}</span>
                    {(step.number === '1' || step.number === '4') && (
                      <span className="step-icon">
                        <Icon name={step.icon} />
                      </span>
                    )}
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
          <section
            className="feature-rail page-container"
            aria-label="Strangely features"
          >
            <div>
              <Icon name="globe" />
              <strong>Private setup</strong>
              <span>No public profile</span>
            </div>
            <div>
              <Icon name="users" />
              <strong>Live matching</strong>
              <span>One person at a time</span>
            </div>
            <div>
              <Icon name="bolt" />
              <strong>Instant</strong>
              <span>Real-time conversations</span>
            </div>
            <div>
              <Icon name="shield" />
              <strong>Your Safety Matters</strong>
              <span>Community Guidelines</span>
            </div>
            <div className="anonymous-feature">
              <Icon name="lock" />
              <strong>No Account Needed</strong>
              <span>Anonymous sessions</span>
            </div>
          </section>
        </div>
        <div className="landing-details">
          <section id="safety" className="safety-section">
            <div className="page-container safety-inner">
              <div>
                <p className="eyebrow">
                  <Icon name="shield" /> Your safety matters
                </p>
                <h2>
                  Keep it kind.
                  <br />
                  <em>Keep it human.</em>
                </h2>
                <p>
                  Leave whenever you want, and use Report or Block when a
                  conversation crosses a line.
                </p>
                <p className="safety-disclosure">
                  General-audience service. Face presence checks are only a
                  local visibility aid and cannot identify people. Suspicious
                  technical activity and reports may be reviewed by the
                  operator.
                </p>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onLegal('guidelines')}
                >
                  Read community guidelines <Icon name="arrow" />
                </button>
              </div>
              <SafetyOrbit />
            </div>
          </section>
          <section
            id="questions"
            className="faq-section page-container"
            aria-labelledby="faq-title"
          >
            <div className="section-heading">
              <p className="eyebrow">Before you start</p>
              <h2 id="faq-title">A few good things to know.</h2>
            </div>
            <div className="faq-list">
              {faqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span>+</span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
          <section className="closing-section page-container">
            <p className="eyebrow">A new conversation is one click away</p>
            <h2>
              Ready to meet
              <br />
              <strong>someone new?</strong>
            </h2>
            <button
              className="button button-primary"
              type="button"
              onClick={onStart}
            >
              <Icon name="camera" /> Get started <Icon name="arrow" />
            </button>
          </section>
        </div>
      </main>
      <footer className="site-footer page-container">
        <Brand onNavigate={() => selectSection('home')} />
        <p>Live conversations, on your terms.</p>
        <nav aria-label="Policies">
          <button type="button" onClick={() => onLegal('privacy')}>
            Privacy
          </button>
          <button type="button" onClick={() => onLegal('terms')}>
            Terms
          </button>
          <button type="button" onClick={() => onLegal('guidelines')}>
            Guidelines
          </button>
        </nav>
      </footer>
    </div>
  );
}
