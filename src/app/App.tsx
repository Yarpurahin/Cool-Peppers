import { ThemeProvider } from './ThemeProvider.tsx';
import { ServiceNotice } from '../components/ui/ServiceNotice.tsx';
import { Component } from 'react';
import type { ReactNode } from 'react';
import { ErrorPage } from '../pages/ErrorPage.tsx';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { DemoProvider } from './DemoProvider.tsx';
import { AppRoutes } from '../routes/AppRoutes.tsx';
import { NegotiationProvider } from '../features/negotiation/NegotiationProvider.tsx';
import { DataProvider, useCatalog } from './DataProvider.tsx';
import { RouteEffects } from '../routes/RouteEffects.tsx';

class RenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <ErrorPage code={500} /> : this.props.children;
  }
}
function SessionApp() {
  const location = useLocation();
  const { user } = useCatalog();
  return (
    <NegotiationProvider key={user?.id ?? 'guest'}>
      <RenderBoundary key={location.pathname}>
        <AppRoutes />
      </RenderBoundary>
    </NegotiationProvider>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ServiceNotice />
        <DemoProvider>
          <DataProvider>
            <RouteEffects />
            <SessionApp />
          </DataProvider>
        </DemoProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
