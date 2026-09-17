import { BrowserRouter } from 'react-router-dom';
import { DemoProvider } from './DemoProvider.tsx';
import { AppRoutes } from '../routes/AppRoutes.tsx';
import { RouteEffects } from '../routes/RouteEffects.tsx';

export function App() {
  return (
    <BrowserRouter>
      <DemoProvider>
        <RouteEffects />
        <AppRoutes />
      </DemoProvider>
    </BrowserRouter>
  );
}
