import { Link } from 'react-router-dom';

export function Logo({ replace = false }: { replace?: boolean }) {
  return (
    <Link to="/" replace={replace} className="brand" aria-label="Арена — главная">
      <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="currentColor" />
        <path
          d="m10 29 10-20 10 20M14 23h12"
          fill="none"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        Арена<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
