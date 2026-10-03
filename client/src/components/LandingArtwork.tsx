import referenceImage from '../assets/landing-reference.png';
import mobileReferenceImage from '../assets/landing-mobile-reference.png';

/** Keep reference artwork separate from the accessible, interactive UI. */
export function LandingArtwork({
  viewBox,
  className = '',
  preserveAspectRatio = 'xMidYMid slice',
  source = 'desktop',
}: {
  viewBox: string;
  className?: string;
  preserveAspectRatio?: string;
  source?: 'desktop' | 'mobile';
}) {
  return (
    <svg
      className={className}
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      aria-hidden="true"
      focusable="false"
    >
      <image
        href={source === 'mobile' ? mobileReferenceImage : referenceImage}
        width={source === 'mobile' ? 854 : 1672}
        height={source === 'mobile' ? 1842 : 941}
      />
    </svg>
  );
}

export function LandingWaves() {
  return (
    <svg
      className="landing-waves"
      viewBox="0 0 1672 941"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ribbon-pink" x1="0" y1="0" x2="1" y2=".8">
          <stop stopColor="#301356" />
          <stop offset=".28" stopColor="#ff40b5" />
          <stop offset=".56" stopColor="#34105f" />
          <stop offset="1" stopColor="#0674f5" />
        </linearGradient>
        <linearGradient id="ribbon-blue" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#7d1da7" />
          <stop offset=".35" stopColor="#087efb" />
          <stop offset=".7" stopColor="#0a1857" />
          <stop offset="1" stopColor="#9945ff" />
        </linearGradient>
      </defs>
      <path
        d="M0 264C84 327 38 449 173 503S465 479 704 557C486 528 271 615 133 554C57 521 25 461 0 442Z"
        fill="url(#ribbon-pink)"
        opacity=".72"
      />
      <path
        d="M0 674C125 845 271 747 454 798S759 807 955 902C645 833 435 888 235 835C111 802 41 775 0 765Z"
        fill="url(#ribbon-blue)"
        opacity=".75"
      />
      <path
        d="M0 689C84 777 129 796 285 807C139 781 83 754 0 726Z"
        fill="url(#ribbon-pink)"
      />
      <path
        d="M1672 715C1578 744 1599 799 1456 826S1210 861 1020 924C1271 856 1554 913 1672 794Z"
        fill="url(#ribbon-blue)"
        opacity=".9"
      />
      <path d="M0 854C175 943 324 937 465 941H0Z" fill="#063ec8" opacity=".3" />
      <path
        d="M706 941C943 899 1027 922 1170 941Z"
        fill="url(#ribbon-pink)"
        opacity=".55"
      />
    </svg>
  );
}

/** Native illustrations keep permission and anonymous matching icons crisp. */
export function CameraMicArtwork() {
  return (
    <svg
      className="native-step-art"
      viewBox="0 0 350 145"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="permission-background">
          <stop stopColor="#163776" />
          <stop offset="1" stopColor="#061027" />
        </radialGradient>
        <linearGradient id="permission-disc" x2="1" y2="1">
          <stop stopColor="#283650" />
          <stop offset="1" stopColor="#141b32" />
        </linearGradient>
      </defs>
      <path fill="url(#permission-background)" d="M0 0h350v145H0z" />
      <circle
        cx="125"
        cy="72"
        r="43"
        fill="url(#permission-disc)"
        stroke="#819cc432"
      />
      <circle
        cx="225"
        cy="72"
        r="43"
        fill="url(#permission-disc)"
        stroke="#819cc432"
      />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="108" y="55" width="25" height="21" rx="4" />
        <path d="m133 61 10-5v20l-10-5" fill="#fff" />
        <rect x="219" y="50" width="12" height="23" rx="6" />
        <path d="M214 65v2a11 11 0 0 0 22 0v-2M225 78v7m-6 0h12" />
      </g>
      <g fill="#d8e2ff" fontFamily="inherit" fontSize="10" textAnchor="middle">
        <text x="125" y="98">
          Camera
        </text>
        <text x="225" y="98">
          Microphone
        </text>
      </g>
    </svg>
  );
}

export function MatchArtwork() {
  return (
    <svg
      className="native-step-art"
      viewBox="0 0 350 145"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="match-background">
          <stop stopColor="#302166" />
          <stop offset="1" stopColor="#061027" />
        </radialGradient>
        <linearGradient id="match-border" x2="1" y2="1">
          <stop stopColor="#0794ff" />
          <stop offset="1" stopColor="#fb44ba" />
        </linearGradient>
      </defs>
      <path fill="url(#match-background)" d="M0 0h350v145H0z" />
      <ellipse
        cx="175"
        cy="73"
        rx="126"
        ry="52"
        fill="none"
        stroke="#ad46e52a"
      />
      <path
        d="M140 72h70"
        stroke="#9569ef"
        strokeWidth="2"
        strokeDasharray="4 5"
      />
      {[72, 206].map((x) => (
        <g
          key={x}
          className="anonymous-avatar"
          transform={`translate(${x} 32)`}
        >
          <rect
            width="72"
            height="82"
            rx="17"
            fill="#0c1b3e"
            stroke="url(#match-border)"
            strokeWidth="2"
          />
          <circle cx="36" cy="28" r="12" fill="#b5c7ff" />
          <path d="M15 65a21 21 0 0 1 42 0Z" fill="#b5c7ff" />
        </g>
      ))}
      <circle cx="175" cy="73" r="17" fill="#161937" stroke="#986dff" />
      <g
        fill="none"
        stroke="#f4f0ff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M166 69h4c4 0 6 8 10 8h4m-3-3 3 3-3 3M166 77h4c4 0 6-8 10-8h4m-3-3 3 3-3 3" />
      </g>
    </svg>
  );
}
