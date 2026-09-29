import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LinkProps } from 'react-router-dom';
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
  ...props
}: Appearance & Pick<LinkProps, 'to' | 'replace'>) {
  return (
    <Link to={to} className={buttonClass(variant, className)} {...props}>
      {children}
    </Link>
  );
}
