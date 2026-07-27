import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { SplashScreen } from './components/feedback/SplashScreen';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ChildrenPage = lazy(() => import('./pages/ChildrenPage'));
const AcademicsPage = lazy(() => import('./pages/AcademicsPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const FeesPage = lazy(() => import('./pages/FeesPage'));
const ExamsPage = lazy(() => import('./pages/ExamsPage'));
const ReportCardPage = lazy(() => import('./pages/ReportCardPage'));
const LeavePage = lazy(() => import('./pages/LeavePage'));
const TimetablePage = lazy(() => import('./pages/TimetablePage'));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

function AppRoutes() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/children" element={<ChildrenPage />} />
          <Route path="/academics" element={<AcademicsPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/fees" element={<FeesPage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/report-card" element={<ReportCardPage />} />
          <Route path="/leave" element={<LeavePage />} />
          <Route path="/timetable" element={<TimetablePage />} />
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return <AppProvider><AppRoutes /></AppProvider>;
}
