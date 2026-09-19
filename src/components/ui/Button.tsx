import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Appearance = { variant?: Variant; className?: string; children: ReactNode };
const buttonClass = (variant: Variant, className: string) =>
  `button button--${variant} ${className}`.trim();

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: Appearance & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  to,
  variant = 'primary',
  className = '',
  children,
}: Appearance & { to: string }) {
  return (
    <Link to={to} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}
