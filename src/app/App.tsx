import { ThemeProvider } from './ThemeProvider.tsx';
import { ServiceNotice } from '../components/ui/ServiceNotice.tsx';
import { Component } from 'react';
import type { ReactNode } from 'react';
import { ErrorPage } from '../pages/ErrorPage.tsx';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { AppRoutes } from '../routes/AppRoutes.tsx';
import { NegotiationProvider } from '../features/negotiation/NegotiationProvider.tsx';
import { DataProvider, useCatalog } from './DataProvider.tsx';
import { RouteEffects } from '../routes/RouteEffects.tsx';
import { GamificationProvider } from '../features/gamification/GamificationProvider.tsx';

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
    <GamificationProvider key={user?.id ?? 'guest'}>
      <NegotiationProvider>
        <RenderBoundary key={location.pathname}>
          <AppRoutes />
        </RenderBoundary>
      </NegotiationProvider>
    </GamificationProvider>
  );
}

export function AppContent() {
  return (
    <ThemeProvider>
      <ServiceNotice />
      <DataProvider>
        <RouteEffects />
        <SessionApp />
      </DataProvider>
    </ThemeProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
