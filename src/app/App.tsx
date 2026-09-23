import { BrowserRouter } from 'react-router-dom';
import { DemoProvider } from './DemoProvider.tsx';
import { AppRoutes } from '../routes/AppRoutes.tsx';
import { NegotiationProvider } from '../features/negotiation/NegotiationProvider.tsx';
import { DataProvider, useCatalog } from './DataProvider.tsx';
import { RouteEffects } from '../routes/RouteEffects.tsx';

function SessionApp() {
  const { user } = useCatalog();
  return (
    <NegotiationProvider key={user?.id ?? 'guest'}>
      <AppRoutes />
    </NegotiationProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <DemoProvider>
        <DataProvider>
          <RouteEffects />
          <SessionApp />
        </DataProvider>
      </DemoProvider>
    </BrowserRouter>
  );
}
