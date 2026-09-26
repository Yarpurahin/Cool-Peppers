import { useEffect, useState } from 'react';
export function Avatar({
  name,
  image,
  className = '',
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'У';
  return (
    <span className={`user-avatar ${className}`} aria-hidden="true">
      {image && !failed ? <img src={image} alt="" onError={() => setFailed(true)} /> : initials}
    </span>
  );
}
