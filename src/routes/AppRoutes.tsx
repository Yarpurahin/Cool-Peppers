import { Route, Routes, Outlet, useParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout.tsx';
import { HomePage } from '../pages/HomePage.tsx';
import { CatalogPage } from '../pages/CatalogPage.tsx';
import { AuthPage } from '../pages/AuthPage.tsx';
import { ProfilePage } from '../pages/ProfilePage.tsx';
import { ScenarioPage } from '../pages/ScenarioPage.tsx';
import { PlayPage } from '../pages/PlayPage.tsx';
import { ResultPage } from '../pages/ResultPage.tsx';
import { EditorListPage } from '../pages/EditorListPage.tsx';
import { EditorPage } from '../pages/EditorPage.tsx';
import { ErrorPage } from '../pages/ErrorPage.tsx';
import { findScenario } from '../data/scenarios.ts';

// Unknown scenario IDs receive a genuine not-found screen, never another scenario.
function ValidScenario() {
  const { scenarioId } = useParams();
  return findScenario(scenarioId) ? <Outlet /> : <ErrorPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="scenarios" element={<CatalogPage />} />
        <Route path="register" element={<AuthPage key="register" mode="register" />} />
        <Route path="login" element={<AuthPage key="login" mode="login" />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="editor" element={<EditorListPage />} />
      </Route>
      <Route element={<ValidScenario />}>
        <Route element={<Layout />}>
          <Route path="scenarios/:scenarioId" element={<ScenarioPage />} />
          <Route path="scenarios/:scenarioId/play" element={<PlayPage />} />
          <Route path="scenarios/:scenarioId/result" element={<ResultPage />} />
          <Route path="editor/:scenarioId" element={<EditorPage />} />
        </Route>
      </Route>
      <Route path="404" element={<ErrorPage />} />
      <Route path="500" element={<ErrorPage code={500} />} />
      <Route path="*" element={<ErrorPage />} />
    </Routes>
  );
}
