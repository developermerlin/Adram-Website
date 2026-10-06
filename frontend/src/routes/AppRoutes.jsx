import '../styles/routeStyles'; // all page stylesheets, in their original order (see the file)
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import PublicLayout, { PageLoading } from '../components/layout/PublicLayout';
import { GuestRoute, ProtectedRoute } from '../components/auth/RouteGuards';
import TrackGate from '../components/portal/TrackGate';

import LandingPage from '../pages/public/LandingPage';
const AboutPage = lazy(() => import('../pages/public/AboutPage'));
const ServicesPage = lazy(() => import('../pages/public/ServicesPage'));
const ServiceDetailPage = lazy(() => import('../pages/public/ServiceDetailPage'));
const CoursesPage = lazy(() => import('../pages/public/CoursesPage'));
const TopicPage = lazy(() => import('../pages/public/TopicPage'));
const TeamPage = lazy(() => import('../pages/public/TeamPage'));
const TeamMemberPage = lazy(() => import('../pages/public/TeamMemberPage'));
const TeamCvPage = lazy(() => import('../pages/public/TeamCvPage'));
const AdminTeamMemberPage = lazy(() => import('../pages/dashboard/AdminTeamPage').then((m) => ({ default: m.AdminTeamMemberPage })));
const AdminTeamPage = lazy(() => import('../pages/dashboard/AdminTeamPage').then((m) => ({ default: m.AdminTeamPage })));
const MyTeamProfilePage = lazy(() => import('../pages/dashboard/AdminTeamPage').then((m) => ({ default: m.MyTeamProfilePage })));
const AdminChatbotPage = lazy(() => import('../pages/dashboard/AdminChatbotPage'));
const LearnPage = lazy(() => import('../pages/public/LearnPage'));
const CertificatePage = lazy(() => import('../pages/public/CertificatePage'));
const BundlesPage = lazy(() => import('../pages/public/BundlesPage'));
const BundlePage = lazy(() => import('../pages/public/BundlePage'));
const GiftPage = lazy(() => import('../pages/public/GiftPage'));
const UnsubscribePage = lazy(() => import('../pages/public/UnsubscribePage'));
const PremiumPage = lazy(() => import('../pages/public/PremiumPage'));
const CampaignsPage = lazy(() => import('../pages/lms-admin/CampaignsPage'));
const InsightsPage = lazy(() => import('../pages/lms-admin/InsightsPage'));
const VerifyCertificatePage = lazy(() => import('../pages/public/VerifyCertificatePage'));
const InstructorProfilePage = lazy(() => import('../pages/public/InstructorProfilePage'));
const CourseDetailPage = lazy(() => import('../pages/public/CourseDetailPage'));
const MyLearningPage = lazy(() => import('../pages/dashboard/MyLearningPage'));
const MyCertificatesPage = lazy(() => import('../pages/dashboard/MyCertificatesPage'));
const NotificationsPage = lazy(() => import('../pages/dashboard/NotificationsPage'));
const CheckoutPage = lazy(() => import('../pages/dashboard/CheckoutPage'));
const CartPage = lazy(() => import('../pages/shop/CartPage'));
const OrderPage = lazy(() => import('../pages/shop/OrderPage'));
const InvoicePage = lazy(() => import('../pages/shop/InvoicePage'));
const PurchasesPage = lazy(() => import('../pages/shop/PurchasesPage'));
const CourseSalesPage = lazy(() => import('../pages/dashboard/CourseSalesPage'));
const CourseBuilderPage = lazy(() => import('../pages/dashboard/CourseBuilderPage'));
const InstructorDashboardPage = lazy(() => import('../pages/instructor/InstructorDashboardPage'));
const InstructorCoursesPage = lazy(() => import('../pages/instructor/InstructorCoursesPage'));
const InstructorCourseEditorPage = lazy(() => import('../pages/instructor/InstructorCourseEditorPage'));
const InstructorAnalyticsPage = lazy(() => import('../pages/instructor/InstructorAnalyticsPage'));
const InstructorEarningsPage = lazy(() => import('../pages/instructor/InstructorEarningsPage'));
const InstructorQuestionsPage = lazy(() => import('../pages/instructor/InstructorQuestionsPage'));
const InstructorReviewsPage = lazy(() => import('../pages/instructor/InstructorReviewsPage'));
const QuestionBanksPage = lazy(() => import('../pages/instructor/QuestionBanksPage'));
const QuestionBankPage = lazy(() => import('../pages/instructor/QuestionBankPage'));
const LmsOverviewPage = lazy(() => import('../pages/lms-admin/LmsOverviewPage'));
const CourseReviewsPage = lazy(() => import('../pages/lms-admin/CourseReviewsPage'));
const CategoriesPage = lazy(() => import('../pages/lms-admin/CategoriesPage'));
const ModerationPage = lazy(() => import('../pages/lms-admin/ModerationPage'));
const AdminCertificatesPage = lazy(() => import('../pages/lms-admin/AdminCertificatesPage'));
const CertificateTemplatesPage = lazy(() => import('../pages/lms-admin/CertificateTemplatesPage'));
const AuditLogPage = lazy(() => import('../pages/lms-admin/AuditLogPage'));
const ScholarshipsPage = lazy(() => import('../pages/public/ScholarshipsPage'));
const ScholarshipDetailPage = lazy(() => import('../pages/public/ScholarshipDetailPage'));
const ContactPage = lazy(() => import('../pages/public/ContactPage'));
const JoinPage = lazy(() => import('../pages/public/JoinPage'));
const NotFoundPage = lazy(() => import('../pages/public/StatusPages').then((m) => ({ default: m.NotFoundPage })));
const UnauthorizedPage = lazy(() => import('../pages/public/StatusPages').then((m) => ({ default: m.UnauthorizedPage })));
const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'));
const OAuthCallbackPage = lazy(() => import('../pages/auth/OAuthCallbackPage'));
const StudentHome = lazy(() => import('../pages/dashboard/StudentHome'));
const TrainingDashboard = lazy(() => import('../pages/dashboard/TrainingDashboard'));
const MyProgressPage = lazy(() => import('../pages/dashboard/MyProgressPage'));
const ReferralsPage = lazy(() => import('../pages/dashboard/ReferralsPage'));
const AffiliatePage = lazy(() => import('../pages/dashboard/AffiliatePage'));
const StudyGroupsPage = lazy(() => import('../pages/dashboard/StudyGroupsPage'));
const StudyGroupPage = lazy(() => import('../pages/dashboard/StudyGroupsPage').then((m) => ({ default: m.StudyGroupPage })));
const ScholarshipDashboard = lazy(() => import('../pages/dashboard/ScholarshipDashboard'));
const AdminDashboard = lazy(() => import('../pages/dashboard/AdminDashboard'));
const AdminLockdownPage = lazy(() => import('../pages/dashboard/AdminLockdownPage'));
const AdminNewsletterPage = lazy(() => import('../pages/dashboard/AdminNewsletterPage'));
const AdminBlogPage = lazy(() => import('../pages/dashboard/AdminBlogPage'));
const AdminBlogEditorPage = lazy(() => import('../pages/dashboard/AdminBlogEditorPage'));
const BlogPage = lazy(() => import('../pages/public/BlogPage'));
const BlogPostPage = lazy(() => import('../pages/public/BlogPostPage'));
const PartnersPage = lazy(() => import('../pages/public/PartnersPage'));
const AdminPartnersPage = lazy(() => import('../pages/dashboard/AdminPartnersPage'));
const ProjectsPage = lazy(() => import('../pages/public/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('../pages/public/ProjectDetailPage'));
const AdminProjectsPage = lazy(() => import('../pages/dashboard/AdminProjectsPage'));
const AdminProjectEditorPage = lazy(() => import('../pages/dashboard/AdminProjectEditorPage'));
const LearningPage = lazy(() => import('../pages/public/LearningPage'));
const LearningFieldPage = lazy(() => import('../pages/public/LearningFieldPage'));
const LearningNotePage = lazy(() => import('../pages/public/LearningNotePage'));
const AdminLearningPage = lazy(() => import('../pages/dashboard/AdminLearningPage'));
const AdminLearningFieldPage = lazy(() => import('../pages/dashboard/AdminLearningFieldPage'));
const AdminLearningNotePage = lazy(() => import('../pages/dashboard/AdminLearningNotePage'));
const NewsletterConfirmPage = lazy(() => import('../pages/public/NewsletterPages').then((m) => ({ default: m.NewsletterConfirmPage })));
const NewsletterUnsubscribePage = lazy(() => import('../pages/public/NewsletterPages').then((m) => ({ default: m.NewsletterUnsubscribePage })));
const ProfilePage = lazy(() => import('../pages/dashboard/ProfilePage'));
const ActivityPage = lazy(() => import('../pages/dashboard/ActivityPage'));
const MessagesPage = lazy(() => import('../pages/dashboard/MessagesPage'));
const ConversationsPage = lazy(() => import('../pages/dashboard/ConversationsPage'));
const AdminUsersPage = lazy(() => import('../pages/dashboard/AdminUsersPage'));
const AdminScholarshipsPage = lazy(() => import('../pages/dashboard/AdminScholarshipsPage'));
const ScholarshipEditorPage = lazy(() => import('../pages/dashboard/ScholarshipEditorPage'));
const AdminCoursesPage = lazy(() => import('../pages/dashboard/AdminCoursesPage'));
const AdminEnrollmentsPage = lazy(() => import('../pages/dashboard/AdminEnrollmentsPage'));
const CourseEditorPage = lazy(() => import('../pages/dashboard/CourseEditorPage'));
const AdminContentPage = lazy(() => import('../pages/dashboard/AdminContentPage'));
const ContentEditorPage = lazy(() => import('../pages/dashboard/ContentEditorPage'));
const AdminStudentPortalPage = lazy(() => import('../pages/dashboard/AdminStudentPortalPage'));
const AdminApplicationsPage = lazy(() => import('../pages/dashboard/AdminApplicationsPage'));
const AdminPaymentSettingsPage = lazy(() => import('../pages/dashboard/AdminPaymentSettingsPage'));
const StudentApplyPage = lazy(() => import('../pages/dashboard/StudentApplyPage'));
const StudentApplicationFormPage = lazy(() => import('../pages/dashboard/StudentApplicationFormPage'));
const ApplicationFormPrintPage = lazy(() => import('../pages/dashboard/ApplicationFormPrintPage'));
const AdminApplicationFormPage = lazy(() => import('../pages/dashboard/AdminApplicationFormPage'));
const StudentAgreementPage = lazy(() => import('../pages/dashboard/StudentAgreementPage'));
const AgreementPrintPage = lazy(() => import('../pages/dashboard/AgreementPrintPage'));
const AdminAgreementsPage = lazy(() => import('../pages/dashboard/AdminAgreementsPage'));
const StudentApplicationsPage = lazy(() => import('../pages/dashboard/StudentApplicationsPage'));
const StudentSavedPage = lazy(() => import('../pages/dashboard/StudentSavedPage'));
const StudentTrainingPage = lazy(() => import('../pages/dashboard/StudentTrainingPage'));

const SCHOLARSHIP_EDITORS = ['ADMIN', 'SCHOLARSHIP_MANAGER'];
const TEACHERS = ['INSTRUCTOR', 'ADMIN'];

const only = (roles, page) => <ProtectedRoute roles={roles}>{page}</ProtectedRoute>;
// A student page from one side of the portal (training or scholarships); see config/tracks.js.
const side = (track, page) => only(['STUDENT'], <TrackGate track={track}>{page}</TrackGate>);

// Pages load on demand: visitors download only the part of the site they open.
export const AppRoutes = () => (
  <Suspense fallback={<PageLoading />}>
  <Routes>
    {/* Public website: shared header and footer */}
    <Route element={<PublicLayout />}>
      <Route index element={<LandingPage />} />
      <Route path="about" element={<AboutPage />} />
      <Route path="about/team" element={<TeamPage />} />
      <Route path="team/:slug" element={<TeamMemberPage />} />
      <Route path="services" element={<ServicesPage />} />
      <Route path="services/:serviceId" element={<ServiceDetailPage />} />
      <Route path="courses" element={<CoursesPage />} />
      <Route path="courses/:slug" element={<CourseDetailPage />} />
      <Route path="topics/:slug" element={<TopicPage />} />
      <Route path="certificate/:code" element={<CertificatePage />} />
      <Route path="verify" element={<VerifyCertificatePage />} />
      <Route path="instructors/:id" element={<InstructorProfilePage />} />
      <Route path="bundles" element={<BundlesPage />} />
      <Route path="bundles/:slug" element={<BundlePage />} />
      <Route path="gift/:code" element={<GiftPage />} />
      <Route path="unsubscribe/:token" element={<UnsubscribePage />} />
      <Route path="newsletter/confirm/:token" element={<NewsletterConfirmPage />} />
      <Route path="blog" element={<BlogPage />} />
      <Route path="partners" element={<PartnersPage />} />
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="projects/:slug" element={<ProjectDetailPage />} />
      <Route path="learning" element={<LearningPage />} />
      <Route path="learning/:field" element={<LearningFieldPage />} />
      <Route path="learning/:field/:note" element={<LearningNotePage />} />
      <Route path="blog/:slug" element={<BlogPostPage />} />
      <Route path="newsletter/unsubscribe/:token" element={<NewsletterUnsubscribePage />} />
      <Route path="premium" element={<PremiumPage />} />
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
    {/* The application form as a printable document (Save as PDF) */}
    <Route path="/student/applications/:id/form/print" element={<ProtectedRoute><ApplicationFormPrintPage /></ProtectedRoute>} />
    <Route path="/student/applications/:id/form/blank" element={<ProtectedRoute><ApplicationFormPrintPage blank /></ProtectedRoute>} />
    <Route path="/team/:slug/cv" element={<TeamCvPage />} />
    <Route path="/team-profile" element={<ProtectedRoute><MyTeamProfilePage /></ProtectedRoute>} />
    <Route path="/student/applications/:id/agreement/print" element={<ProtectedRoute><AgreementPrintPage /></ProtectedRoute>} />
    <Route path="/admin/agreements/:id" element={only(['ADMIN'], <AgreementPrintPage staff />)} />
    <Route path="/admin/applications/:id/form" element={only(['ADMIN'], <ApplicationFormPrintPage staff />)} />

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

    {/* Students: one dashboard per side (training, scholarships); /student/dashboard sends them to theirs */}
    <Route path="/student/dashboard" element={only(['STUDENT'], <StudentHome />)} />
    <Route path="/student/dashboard/training" element={side('training', <TrainingDashboard />)} />
    <Route path="/student/learning" element={side('training', <MyLearningPage />)} />
    <Route path="/student/progress" element={side('training', <MyProgressPage />)} />
    <Route path="/student/referrals" element={side('training', <ReferralsPage />)} />
    <Route path="/student/affiliate" element={side('training', <AffiliatePage />)} />
    <Route path="/student/groups" element={side('training', <StudyGroupsPage />)} />
    <Route path="/student/groups/:id" element={side('training', <StudyGroupPage />)} />
    <Route path="/student/certificates" element={side('training', <MyCertificatesPage />)} />
    <Route path="/student/purchases" element={side('training', <PurchasesPage />)} />
    <Route path="/student/training" element={side('training', <StudentTrainingPage />)} />
    <Route path="/checkout/:slug" element={only(['STUDENT'], <CheckoutPage />)} />
    <Route path="/student/dashboard/scholarships" element={side('scholarships', <ScholarshipDashboard />)} />
    <Route path="/student/applications" element={side('scholarships', <StudentApplicationsPage />)} />
    <Route path="/student/saved" element={side('scholarships', <StudentSavedPage />)} />
    <Route path="/student/applications/:id/apply" element={side('scholarships', <StudentApplyPage />)} />
    <Route path="/student/applications/:id/form" element={side('scholarships', <StudentApplicationFormPage />)} />
    <Route path="/student/applications/:id/agreement" element={side('scholarships', <StudentAgreementPage />)} />

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
    <Route path="/instructor/question-banks" element={only(TEACHERS, <QuestionBanksPage />)} />
    <Route path="/instructor/question-banks/:id" element={only(TEACHERS, <QuestionBankPage key="bank" />)} />
    <Route path="/admin/question-banks" element={only(['ADMIN'], <QuestionBanksPage />)} />
    <Route path="/admin/question-banks/:id" element={only(['ADMIN'], <QuestionBankPage key="bank" />)} />

    {/* Administrators */}
    <Route path="/admin/dashboard" element={only(['ADMIN'], <AdminDashboard />)} />
    <Route path="/admin/users" element={only(['ADMIN'], <AdminUsersPage />)} />
    <Route path="/admin/messages" element={only(['ADMIN'], <MessagesPage />)} />
    <Route path="/admin/settings/payments" element={only(['ADMIN'], <AdminPaymentSettingsPage />)} />
    <Route path="/admin/settings/lockdown" element={only(['ADMIN'], <AdminLockdownPage />)} />
    <Route path="/admin/settings/application-form" element={only(['ADMIN'], <AdminApplicationFormPage />)} />
    <Route path="/admin/agreements" element={only(['ADMIN'], <AdminAgreementsPage />)} />
    <Route path="/admin/newsletter" element={only(['ADMIN'], <AdminNewsletterPage />)} />
    <Route path="/admin/blog" element={only(['ADMIN'], <AdminBlogPage />)} />
    <Route path="/admin/partners" element={only(['ADMIN'], <AdminPartnersPage />)} />
    <Route path="/admin/projects" element={only(['ADMIN'], <AdminProjectsPage />)} />
    <Route path="/admin/projects/:id" element={only(['ADMIN'], <AdminProjectEditorPage />)} />
    <Route path="/admin/learning" element={only(['ADMIN'], <AdminLearningPage />)} />
    <Route path="/admin/learning/notes/:id" element={only(['ADMIN'], <AdminLearningNotePage />)} />
    <Route path="/admin/learning/:id" element={only(['ADMIN'], <AdminLearningFieldPage />)} />
    <Route path="/admin/team" element={only(['ADMIN'], <AdminTeamPage />)} />
    <Route path="/admin/chatbot" element={only(['ADMIN'], <AdminChatbotPage />)} />
    <Route path="/admin/team/:id" element={only(['ADMIN'], <AdminTeamMemberPage />)} />
    <Route path="/admin/blog/new" element={only(['ADMIN'], <AdminBlogEditorPage key="new" />)} />
    <Route path="/admin/blog/:id" element={only(['ADMIN'], <AdminBlogEditorPage />)} />
    <Route path="/admin/applications" element={only(['ADMIN'], <AdminApplicationsPage />)} />
    <Route path="/admin/students/:id" element={only(['ADMIN'], <AdminStudentPortalPage />)} />
    <Route path="/admin/scholarships" element={only(SCHOLARSHIP_EDITORS, <AdminScholarshipsPage />)} />
    <Route path="/admin/scholarships/new" element={only(SCHOLARSHIP_EDITORS, <ScholarshipEditorPage key="new" />)} />
    <Route path="/admin/scholarships/:id" element={only(SCHOLARSHIP_EDITORS, <ScholarshipEditorPage />)} />
    <Route path="/admin/content" element={only(['ADMIN'], <AdminContentPage />)} />
    <Route path="/admin/content/:slug" element={only(['ADMIN'], <ContentEditorPage />)} />
    <Route path="/admin/lms" element={only(['ADMIN'], <LmsOverviewPage />)} />
    <Route path="/admin/courses" element={only(['ADMIN'], <AdminCoursesPage />)} />
    <Route path="/admin/enrollments" element={only(['ADMIN'], <AdminEnrollmentsPage />)} />
    <Route path="/admin/courses/new" element={only(['ADMIN'], <CourseEditorPage key="new" />)} />
    <Route path="/admin/courses/:slug/content" element={only(['ADMIN'], <CourseBuilderPage />)} />
    <Route path="/admin/courses/:id" element={only(['ADMIN'], <CourseEditorPage />)} />
    <Route path="/admin/course-reviews" element={only(['ADMIN'], <CourseReviewsPage />)} />
    <Route path="/admin/categories" element={only(['ADMIN'], <CategoriesPage />)} />
    <Route path="/admin/course-sales" element={only(['ADMIN'], <CourseSalesPage />)} />
    <Route path="/admin/moderation" element={only(['ADMIN'], <ModerationPage />)} />
    <Route path="/admin/certificates" element={only(['ADMIN'], <AdminCertificatesPage />)} />
    <Route path="/admin/campaigns" element={only(['ADMIN'], <CampaignsPage />)} />
    <Route path="/admin/insights" element={only(['ADMIN'], <InsightsPage />)} />
    <Route path="/admin/certificate-templates" element={only(['ADMIN'], <CertificateTemplatesPage />)} />
    <Route path="/admin/audit" element={only(['ADMIN'], <AuditLogPage />)} />
  </Routes>
  </Suspense>
);

export default AppRoutes;
