import { PageLoader } from '@hud/ui';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Shell } from './components/Shell';
import { AttentionPage } from './pages/Attention';
import { LoginPage } from './pages/Login';
import { ProgramsPage } from './pages/Programs';
import { ReferencePage } from './pages/Reference';
import { SettingsPage } from './pages/Settings';
import { StudentsPage } from './pages/Students';

const StudentPage = lazy(() => import('./pages/Student').then((m) => ({ default: m.StudentPage })));

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<AttentionPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentPage />} />
          <Route path="/students/:id/:tab" element={<StudentPage />} />
          <Route path="/programs" element={<ProgramsPage />} />
          <Route path="/reference" element={<ReferencePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
