import { Route, Routes } from 'react-router-dom';
import PublicLayout from '../components/layout/PublicLayout';
import { GuestRoute, ProtectedRoute } from '../components/auth/RouteGuards';

import LandingPage from '../pages/public/LandingPage';
import AboutPage from '../pages/public/AboutPage';
import ServicesPage from '../pages/public/ServicesPage';
import ServiceDetailPage from '../pages/public/ServiceDetailPage';
import CoursesPage from '../pages/public/CoursesPage';
import TeamPage from '../pages/public/TeamPage';
import LearnPage from '../pages/public/LearnPage';
import CertificatePage from '../pages/public/CertificatePage';
import VerifyCertificatePage from '../pages/public/VerifyCertificatePage';
import InstructorProfilePage from '../pages/public/InstructorProfilePage';
import CourseDetailPage from '../pages/public/CourseDetailPage';
import MyLearningPage from '../pages/dashboard/MyLearningPage';
import MyCertificatesPage from '../pages/dashboard/MyCertificatesPage';
import NotificationsPage from '../pages/dashboard/NotificationsPage';
import CheckoutPage from '../pages/dashboard/CheckoutPage';
import CartPage from '../pages/shop/CartPage';
import OrderPage from '../pages/shop/OrderPage';
import InvoicePage from '../pages/shop/InvoicePage';
import PurchasesPage from '../pages/shop/PurchasesPage';
import CourseSalesPage from '../pages/dashboard/CourseSalesPage';
import CourseBuilderPage from '../pages/dashboard/CourseBuilderPage';
import InstructorDashboardPage from '../pages/instructor/InstructorDashboardPage';
import InstructorCoursesPage from '../pages/instructor/InstructorCoursesPage';
import InstructorCourseEditorPage from '../pages/instructor/InstructorCourseEditorPage';
import InstructorAnalyticsPage from '../pages/instructor/InstructorAnalyticsPage';
import InstructorEarningsPage from '../pages/instructor/InstructorEarningsPage';
import InstructorQuestionsPage from '../pages/instructor/InstructorQuestionsPage';
import InstructorReviewsPage from '../pages/instructor/InstructorReviewsPage';
import LmsOverviewPage from '../pages/lms-admin/LmsOverviewPage';
import CourseReviewsPage from '../pages/lms-admin/CourseReviewsPage';
import CategoriesPage from '../pages/lms-admin/CategoriesPage';
import ModerationPage from '../pages/lms-admin/ModerationPage';
import AdminCertificatesPage from '../pages/lms-admin/AdminCertificatesPage';
import AuditLogPage from '../pages/lms-admin/AuditLogPage';
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
import AdminContentPage from '../pages/dashboard/AdminContentPage';
import ContentEditorPage from '../pages/dashboard/ContentEditorPage';
import AdminStudentPortalPage from '../pages/dashboard/AdminStudentPortalPage';
import AdminApplicationsPage from '../pages/dashboard/AdminApplicationsPage';
import AdminPaymentSettingsPage from '../pages/dashboard/AdminPaymentSettingsPage';
import StudentApplyPage from '../pages/dashboard/StudentApplyPage';
import StudentApplicationsPage from '../pages/dashboard/StudentApplicationsPage';
import StudentSavedPage from '../pages/dashboard/StudentSavedPage';
import StudentTrainingPage from '../pages/dashboard/StudentTrainingPage';

const SCHOLARSHIP_EDITORS = ['ADMIN', 'SCHOLARSHIP_MANAGER'];
const TEACHERS = ['INSTRUCTOR', 'ADMIN'];

const only = (roles, page) => <ProtectedRoute roles={roles}>{page}</ProtectedRoute>;

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
      <Route path="courses/:slug" element={<CourseDetailPage />} />
      <Route path="certificate/:code" element={<CertificatePage />} />
      <Route path="verify" element={<VerifyCertificatePage />} />
      <Route path="instructors/:id" element={<InstructorProfilePage />} />
      <Route path="cart" element={only(['STUDENT'], <CartPage />)} />
      <Route path="orders/:id" element={<ProtectedRoute><OrderPage /></ProtectedRoute>} />
      <Route path="scholarships" element={<ScholarshipsPage />} />
      <Route path="scholarships/:scholarshipId" element={<ScholarshipDetailPage />} />
      <Route path="contact" element={<ContactPage />} />
      <Route path="join" element={<JoinPage />} />
      <Route path="unauthorized" element={<UnauthorizedPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>

    {/* Course player: its own full-screen layout, like a video course site */}
    <Route path="/learn/:slug" element={<LearnPage />} />
    <Route path="/learn/:slug/lesson/:lessonId" element={<LearnPage />} />
    {/* A printable invoice, without the site around it */}
    <Route path="/orders/:id/invoice" element={<ProtectedRoute><InvoicePage /></ProtectedRoute>} />

    {/* Authentication */}
    <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
    <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
    <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
    <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

    {/* Everyone signed in */}
    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="/activity" element={<ProtectedRoute><ActivityPage /></ProtectedRoute>} />
    <Route path="/messages" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />

    {/* Students */}
    <Route path="/student/dashboard" element={only(['STUDENT'], <StudentDashboard />)} />
    <Route path="/student/learning" element={only(['STUDENT'], <MyLearningPage />)} />
    <Route path="/student/certificates" element={only(['STUDENT'], <MyCertificatesPage />)} />
    <Route path="/student/purchases" element={only(['STUDENT'], <PurchasesPage />)} />
    <Route path="/checkout/:slug" element={only(['STUDENT'], <CheckoutPage />)} />
    <Route path="/student/applications" element={only(['STUDENT'], <StudentApplicationsPage />)} />
    <Route path="/student/saved" element={only(['STUDENT'], <StudentSavedPage />)} />
    <Route path="/student/training" element={only(['STUDENT'], <StudentTrainingPage />)} />
    <Route path="/student/applications/:id/apply" element={only(['STUDENT'], <StudentApplyPage />)} />

    {/* Instructors (administrators can open these too) */}
    <Route path="/instructor" element={only(TEACHERS, <InstructorDashboardPage />)} />
    <Route path="/instructor/courses" element={only(TEACHERS, <InstructorCoursesPage />)} />
    <Route path="/instructor/courses/:slug" element={only(TEACHERS, <InstructorCourseEditorPage />)} />
    {/* The course builder: curriculum | students | qa | announcements | submissions */}
    <Route path="/instructor/courses/:slug/:tab" element={only(TEACHERS, <CourseBuilderPage />)} />
    <Route path="/instructor/analytics" element={only(TEACHERS, <InstructorAnalyticsPage />)} />
    <Route path="/instructor/earnings" element={only(TEACHERS, <InstructorEarningsPage />)} />
    <Route path="/instructor/questions" element={only(TEACHERS, <InstructorQuestionsPage />)} />
    <Route path="/instructor/reviews" element={only(TEACHERS, <InstructorReviewsPage />)} />

    {/* Administrators */}
    <Route path="/admin/dashboard" element={only(['ADMIN'], <AdminDashboard />)} />
    <Route path="/admin/users" element={only(['ADMIN'], <AdminUsersPage />)} />
    <Route path="/admin/messages" element={only(['ADMIN'], <MessagesPage />)} />
    <Route path="/admin/settings/payments" element={only(['ADMIN'], <AdminPaymentSettingsPage />)} />
    <Route path="/admin/applications" element={only(['ADMIN'], <AdminApplicationsPage />)} />
    <Route path="/admin/students/:id" element={only(['ADMIN'], <AdminStudentPortalPage />)} />
    <Route path="/admin/scholarships" element={only(SCHOLARSHIP_EDITORS, <AdminScholarshipsPage />)} />
    <Route path="/admin/scholarships/new" element={only(SCHOLARSHIP_EDITORS, <ScholarshipEditorPage key="new" />)} />
    <Route path="/admin/scholarships/:id" element={only(SCHOLARSHIP_EDITORS, <ScholarshipEditorPage />)} />
    <Route path="/admin/content" element={only(['ADMIN'], <AdminContentPage />)} />
    <Route path="/admin/content/:slug" element={only(['ADMIN'], <ContentEditorPage />)} />
    <Route path="/admin/lms" element={only(['ADMIN'], <LmsOverviewPage />)} />
    <Route path="/admin/courses" element={only(['ADMIN'], <AdminCoursesPage />)} />
    <Route path="/admin/courses/new" element={only(['ADMIN'], <CourseEditorPage key="new" />)} />
    <Route path="/admin/courses/:slug/content" element={only(['ADMIN'], <CourseBuilderPage />)} />
    <Route path="/admin/courses/:id" element={only(['ADMIN'], <CourseEditorPage />)} />
    <Route path="/admin/course-reviews" element={only(['ADMIN'], <CourseReviewsPage />)} />
    <Route path="/admin/categories" element={only(['ADMIN'], <CategoriesPage />)} />
    <Route path="/admin/course-sales" element={only(['ADMIN'], <CourseSalesPage />)} />
    <Route path="/admin/moderation" element={only(['ADMIN'], <ModerationPage />)} />
    <Route path="/admin/certificates" element={only(['ADMIN'], <AdminCertificatesPage />)} />
    <Route path="/admin/audit" element={only(['ADMIN'], <AuditLogPage />)} />
  </Routes>
);

export default AppRoutes;
