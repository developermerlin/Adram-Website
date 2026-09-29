import { Route, Routes } from 'react-router-dom';
import PublicLayout from '../components/layout/PublicLayout';
import { GuestRoute, ProtectedRoute } from '../components/auth/RouteGuards';

import LandingPage from '../pages/public/LandingPage';
import AboutPage from '../pages/public/AboutPage';
import ServicesPage from '../pages/public/ServicesPage';
import ServiceDetailPage from '../pages/public/ServiceDetailPage';
import CoursesPage from '../pages/public/CoursesPage';
import TeamPage from '../pages/public/TeamPage';
import ScholarshipsPage from '../pages/public/ScholarshipsPage';
import ScholarshipDetailPage from '../pages/public/ScholarshipDetailPage';
import ContactPage from '../pages/public/ContactPage';
import JoinPage from '../pages/public/JoinPage';
import { NotFoundPage, UnauthorizedPage } from '../pages/public/StatusPages';
import LoginPage from '../pages/auth/LoginPage';
import RegisterPage from '../pages/auth/RegisterPage';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import OAuthCallbackPage from '../pages/auth/OAuthCallbackPage';
import StudentDashboard from '../pages/dashboard/StudentDashboard';
import AdminDashboard from '../pages/dashboard/AdminDashboard';
import ProfilePage from '../pages/dashboard/ProfilePage';
import ActivityPage from '../pages/dashboard/ActivityPage';
import MessagesPage from '../pages/dashboard/MessagesPage';
import ConversationsPage from '../pages/dashboard/ConversationsPage';
import AdminUsersPage from '../pages/dashboard/AdminUsersPage';
import AdminScholarshipsPage from '../pages/dashboard/AdminScholarshipsPage';
import ScholarshipEditorPage from '../pages/dashboard/ScholarshipEditorPage';
import AdminCoursesPage from '../pages/dashboard/AdminCoursesPage';
import CourseEditorPage from '../pages/dashboard/CourseEditorPage';
import AdminStudentPortalPage from '../pages/dashboard/AdminStudentPortalPage';
import AdminApplicationsPage from '../pages/dashboard/AdminApplicationsPage';
import AdminPaymentSettingsPage from '../pages/dashboard/AdminPaymentSettingsPage';
import StudentApplyPage from '../pages/dashboard/StudentApplyPage';
import StudentApplicationsPage from '../pages/dashboard/StudentApplicationsPage';
import StudentSavedPage from '../pages/dashboard/StudentSavedPage';
import StudentTrainingPage from '../pages/dashboard/StudentTrainingPage';

const SCHOLARSHIP_EDITORS = ['ADMIN', 'SCHOLARSHIP_MANAGER'];

export const AppRoutes = () => (
  <Routes>
    {/* Public website: shared header and footer */}
    <Route element={<PublicLayout />}>
      <Route index element={<LandingPage />} />
      <Route path="about" element={<AboutPage />} />
      <Route path="about/team" element={<TeamPage />} />
      <Route path="services" element={<ServicesPage />} />
      <Route path="services/:serviceId" element={<ServiceDetailPage />} />
      <Route path="courses" element={<CoursesPage />} />
      <Route path="scholarships" element={<ScholarshipsPage />} />
      <Route path="scholarships/:scholarshipId" element={<ScholarshipDetailPage />} />
      <Route path="contact" element={<ContactPage />} />
      <Route path="join" element={<JoinPage />} />
      <Route path="unauthorized" element={<UnauthorizedPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>

    {/* Authentication */}
    <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
    <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
    <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
    <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

    {/* Portal */}
    <Route path="/student/dashboard" element={<ProtectedRoute roles={['STUDENT']}><StudentDashboard /></ProtectedRoute>} />
    <Route path="/admin/dashboard" element={<ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
    <Route path="/admin/users" element={<ProtectedRoute roles={['ADMIN']}><AdminUsersPage /></ProtectedRoute>} />
    <Route path="/admin/messages" element={<ProtectedRoute roles={['ADMIN']}><MessagesPage /></ProtectedRoute>} />
    <Route path="/student/applications" element={<ProtectedRoute roles={['STUDENT']}><StudentApplicationsPage /></ProtectedRoute>} />
    <Route path="/student/saved" element={<ProtectedRoute roles={['STUDENT']}><StudentSavedPage /></ProtectedRoute>} />
    <Route path="/student/training" element={<ProtectedRoute roles={['STUDENT']}><StudentTrainingPage /></ProtectedRoute>} />
    <Route path="/student/applications/:id/apply" element={<ProtectedRoute roles={['STUDENT']}><StudentApplyPage /></ProtectedRoute>} />
    <Route path="/admin/settings/payments" element={<ProtectedRoute roles={['ADMIN']}><AdminPaymentSettingsPage /></ProtectedRoute>} />
    <Route path="/admin/applications" element={<ProtectedRoute roles={['ADMIN']}><AdminApplicationsPage /></ProtectedRoute>} />
    <Route path="/admin/students/:id" element={<ProtectedRoute roles={['ADMIN']}><AdminStudentPortalPage /></ProtectedRoute>} />
    <Route path="/admin/scholarships" element={<ProtectedRoute roles={SCHOLARSHIP_EDITORS}><AdminScholarshipsPage /></ProtectedRoute>} />
    <Route path="/admin/scholarships/new" element={<ProtectedRoute roles={SCHOLARSHIP_EDITORS}><ScholarshipEditorPage key="new" /></ProtectedRoute>} />
    <Route path="/admin/scholarships/:id" element={<ProtectedRoute roles={SCHOLARSHIP_EDITORS}><ScholarshipEditorPage /></ProtectedRoute>} />
    <Route path="/admin/courses" element={<ProtectedRoute roles={['ADMIN']}><AdminCoursesPage /></ProtectedRoute>} />
    <Route path="/admin/courses/new" element={<ProtectedRoute roles={['ADMIN']}><CourseEditorPage key="new" /></ProtectedRoute>} />
    <Route path="/admin/courses/:id" element={<ProtectedRoute roles={['ADMIN']}><CourseEditorPage /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="/activity" element={<ProtectedRoute><ActivityPage /></ProtectedRoute>} />
    <Route path="/messages" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
  </Routes>
);

export default AppRoutes;
