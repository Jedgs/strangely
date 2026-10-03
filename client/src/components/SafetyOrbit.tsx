const orbits = [
  {
    id: 'outer',
    path: 'M95 300a205 205 0 1 0 410 0a205 205 0 1 0-410 0',
    rotation: 0,
    duration: '24s',
    delay: '-6s',
    color: '#4e87ff',
  },
  {
    id: 'pink',
    path: 'M34 300a266 148 0 1 0 532 0a266 148 0 1 0-532 0',
    rotation: 28,
    duration: '19s',
    delay: '-3s',
    color: '#fa48ad',
  },
  {
    id: 'blue',
    path: 'M145 300a155 254 0 1 0 310 0a155 254 0 1 0-310 0',
    rotation: -30,
    duration: '15s',
    delay: '-9s',
    color: '#258cff',
  },
] as const;

export function SafetyOrbit() {
  return (
    <div className="safety-orbit" aria-hidden="true">
      <span>18+</span>
      <span>Private</span>
      <span>Respect</span>
      <svg className="orbit-art" viewBox="0 0 600 600" focusable="false">
        <defs>
          {orbits.map((orbit) => (
            <path
              key={orbit.id}
              id={`safety-orbit-${orbit.id}`}
              d={orbit.path}
            />
          ))}
        </defs>
        {orbits.map((orbit) => (
          <g key={orbit.id} transform={`rotate(${orbit.rotation} 300 300)`}>
            <use
              href={`#safety-orbit-${orbit.id}`}
              fill="none"
              stroke={orbit.color}
            />
            <g className="orbit-satellite">
              <circle r="10" fill={orbit.color} opacity=".2" />
              <circle r="4" fill="#fff" />
              <path
                d="M-10 0H10M0-10V10"
                stroke={orbit.color}
                strokeWidth="1.5"
              />
              <animateMotion
                dur={orbit.duration}
                begin={orbit.delay}
                repeatCount="indefinite"
              >
                <mpath href={`#safety-orbit-${orbit.id}`} />
              </animateMotion>
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
