import { Route, Routes, Outlet, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Layout } from '../components/layout/Layout.tsx';
import { AdminLayout } from '../components/admin/AdminLayout.tsx';
import { HomePage } from '../pages/HomePage.tsx';
import { CatalogPage } from '../pages/CatalogPage.tsx';
import { AuthPage } from '../pages/AuthPage.tsx';
import { ProfilePage } from '../pages/ProfilePage.tsx';
import { ScenarioPage } from '../pages/ScenarioPage.tsx';
import { PlayPage } from '../pages/PlayPage.tsx';
import { ResultPage } from '../pages/ResultPage.tsx';
import { AdminDashboardPage } from '../pages/AdminDashboardPage.tsx';
import { EditorListPage } from '../pages/EditorListPage.tsx';
const EditorPage = lazy(() =>
  import('../pages/EditorPage.tsx').then((module) => ({ default: module.EditorPage })),
);
import { RequestFailure } from '../components/ui/RequestFailure.tsx';
import { AdminAccountsPage } from '../pages/AdminAccountsPage.tsx';
import { ErrorPage } from '../pages/ErrorPage.tsx';
import { RequireAdmin, RequireAuth, useCatalog } from '../app/DataProvider.tsx';
import { AttemptPage } from '../pages/AttemptPage.tsx';

// Unknown scenario IDs receive a genuine not-found screen, never another scenario.
function ValidScenario() {
  const { findScenario, catalogStatus, catalogError } = useCatalog();
  const { scenarioId } = useParams();
  if (findScenario(scenarioId)) return <Outlet />;
  if (catalogStatus === 'loading')
    return (
      <main className="container page" role="status">
        Загружаем сценарий…
      </main>
    );
  if (catalogStatus === 'error') return <RequestFailure error={catalogError} />;
  return <ErrorPage />;
}

export function AppRoutes() {
  return (
    <Suspense
      fallback={
        <main className="container page" role="status">
          Загружаем конструктор…
        </main>
      }
    >
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="scenarios" element={<CatalogPage />} />
          <Route path="register" element={<AuthPage key="register" mode="register" />} />
          <Route path="login" element={<AuthPage key="login" mode="login" />} />
          <Route
            path="profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="attempts/:attemptId"
            element={
              <RequireAuth>
                <AttemptPage />
              </RequireAuth>
            }
          />

          <Route
            path="admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="accounts" element={<AdminAccountsPage />} />
            <Route path="scenarios" element={<EditorListPage />} />
          </Route>

          {/* Legacy editor URLs are intentionally kept while the admin area is introduced. */}
          <Route
            path="editor"
            element={
              <RequireAdmin>
                <EditorListPage />
              </RequireAdmin>
            }
          />
        </Route>
        {/* The maker has its own full-height workspace, matching the design reference. */}
        <Route
          path="admin/scenarios/:scenarioId"
          element={
            <RequireAdmin>
              <EditorPage />
            </RequireAdmin>
          }
        />
        <Route
          path="editor/:scenarioId"
          element={
            <RequireAdmin>
              <EditorPage />
            </RequireAdmin>
          }
        />
        <Route element={<ValidScenario />}>
          <Route element={<Layout />}>
            <Route path="scenarios/:scenarioId" element={<ScenarioPage />} />
            <Route path="scenarios/:scenarioId/play" element={<PlayPage />} />
            <Route path="scenarios/:scenarioId/result" element={<ResultPage />} />
          </Route>
        </Route>
        <Route path="404" element={<ErrorPage />} />
        <Route path="500" element={<ErrorPage code={500} />} />
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </Suspense>
  );
}
