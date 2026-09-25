import type { ScenarioArt as ArtType } from '../../types/scenario.ts';

export function ScenarioArt({
  kind,
  image,
}: {
  kind: ArtType;
  image?: { src: string; alt: string };
}) {
  if (image)
    return (
      <img
        className="scenario-art scenario-art--image"
        src={image.src}
        alt={image.alt}
        width={360}
        height={176}
        loading="lazy"
        decoding="async"
      />
    );
  return (
    <svg
      className={`scenario-art scenario-art--${kind}`}
      viewBox="0 0 360 176"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="186" cy="139" rx="74" ry="9" fill="currentColor" opacity=".09" />
      {kind === 'calendar' && (
        <>
          <g transform="rotate(-8 176 84)">
            <rect x="121" y="26" width="101" height="108" rx="12" fill="#fffef8" stroke="#d7dacb" />
            <path
              d="M121 53h101M144 20v17m54-17v17"
              stroke="#749175"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {[0, 1, 2].map((row) =>
              [0, 1, 2].map((col) => (
                <rect
                  key={`${row}-${col}`}
                  x={137 + col * 25}
                  y={66 + row * 21}
                  width="15"
                  height="12"
                  rx="3"
                  fill={row === 1 && col === 2 ? '#c34a27' : '#e3e8dc'}
                />
              )),
            )}
          </g>
          <circle cx="221" cy="112" r="31" fill="#285443" stroke="#f3f5ed" strokeWidth="4" />
          <path d="M221 95v18l12 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {kind === 'conversation' && (
        <>
          <g transform="rotate(-7 155 74)">
            <path
              d="M114 35h93a9 9 0 0 1 9 9v54a9 9 0 0 1-9 9h-55l-20 15v-15h-18a9 9 0 0 1-9-9V44a9 9 0 0 1 9-9"
              fill="#fffef8"
            />
            <path
              d="M124 55h72m-72 12h58m-58 12h38"
              stroke="#91a48a"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
          <g transform="rotate(8 215 103)">
            <path
              d="M180 77h66a12 12 0 0 1 12 12v30a12 12 0 0 1-12 12h-6v14l-17-14h-43a12 12 0 0 1-12-12V89a12 12 0 0 1 12-12"
              fill="#285443"
            />
            <g fill="#f1eee2">
              <circle cx="192" cy="105" r="3" />
              <circle cx="213" cy="105" r="3" />
              <circle cx="234" cy="105" r="3" />
            </g>
          </g>
        </>
      )}
      {kind === 'agreement' && (
        <>
          <g transform="rotate(-10 170 80)">
            <rect x="126" y="22" width="92" height="111" rx="10" fill="#fffef8" stroke="#dccfc0" />
            <path
              d="M143 45h55m-55 12h46m-46 18h52m-52 12h34m-34 23 10-5 6 5 15-7"
              stroke="#a8ab95"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
          <g transform="rotate(8 220 111)">
            <rect x="190" y="83" width="62" height="53" rx="15" fill="#c34a27" />
            <path
              d="m203 109 11 10 23-22"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </>
      )}
    </svg>
  );
}
