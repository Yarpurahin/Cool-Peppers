import type { ReactNode } from 'react';
import { Icon } from './Icon.tsx';

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="demo-notice">
      <Icon name="info" size={18} />
      <p>{children}</p>
    </div>
  );
}
