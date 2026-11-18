import { PageLoader } from '@hud/ui';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { ConsentsPage } from './pages/Consents';
import { FeedbackPage } from './pages/Feedback';
import { InstallPage } from './pages/Install';
import { InvitePage } from './pages/Invite';
import { LoginPage } from './pages/Login';
import { ProfilePage } from './pages/Profile';
import { TodayPage } from './pages/Today';

// Тяжёлые экраны (графики, редактор) загружаются по требованию.
const MealEditorPage = lazy(() => import('./pages/MealEditor').then((m) => ({ default: m.MealEditorPage })));
const DaySummaryPage = lazy(() => import('./pages/DaySummary').then((m) => ({ default: m.DaySummaryPage })));
const WeightPage = lazy(() => import('./pages/Weight').then((m) => ({ default: m.WeightPage })));
const ReportsPage = lazy(() => import('./pages/Reports').then((m) => ({ default: m.ReportsPage })));
const ReportPage = lazy(() => import('./pages/Reports').then((m) => ({ default: m.ReportPage })));
const OnboardingPage = lazy(() => import('./pages/Onboarding').then((m) => ({ default: m.OnboardingPage })));

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/install" element={<InstallPage />} />
        <Route element={<AppShell />}>
          <Route path="/consents" element={<ConsentsPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/" element={<TodayPage />} />
          <Route path="/day/:date" element={<TodayPage />} />
          <Route path="/day/:date/summary" element={<DaySummaryPage />} />
          <Route path="/meal/new" element={<MealEditorPage />} />
          <Route path="/meal/:id" element={<MealEditorPage />} />
          <Route path="/weight" element={<WeightPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:weekStart" element={<ReportPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
