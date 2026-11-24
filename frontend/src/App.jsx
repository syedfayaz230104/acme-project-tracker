import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';

// Pages are code-split so the login screen loads fast.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const DeliverablesPage = lazy(() => import('./pages/DeliverablesPage'));
const DeliverableDetailPage = lazy(() => import('./pages/DeliverableDetailPage'));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage'));
const BudgetPage = lazy(() => import('./pages/BudgetPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const fallback = (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
);

/** Route table. Everything except /login requires authentication. */
export default function App() {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="deliverables" element={<DeliverablesPage />} />
          <Route path="deliverables/:id" element={<DeliverableDetailPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="users" element={<ProtectedRoute action="manage_users"><UsersPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
