export function MasteryStars({
  value,
  label = true,
  compact = false,
}: {
  value: number;
  label?: boolean;
  compact?: boolean;
}) {
  const stars = Math.max(0, Math.min(3, Math.trunc(value)));
  return (
    <span
      className={`mastery-stars ${compact ? 'mastery-stars--compact' : ''}`}
      aria-label={`Мастерство: ${stars} из 3`}
      title={`Мастерство: ${stars} из 3`}
    >
      <span className="mastery-stars-icons" aria-hidden="true">
        {[1, 2, 3].map((index) => (
          <span key={index} className={index <= stars ? 'is-filled' : ''}>
            ★
          </span>
        ))}
      </span>
      {label && <small>{stars}/3</small>}
    </span>
  );
}
