import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from '../components/ProtectedRoute';

import { LandingPage } from '../pages/LandingPage';
import { AboutPage } from '../pages/AboutPage';
import { CoursesPage } from '../pages/CoursesPage';
import { InstructorPage } from '../pages/InstructorPage';
import { ScholarshipPage } from '../pages/ScholarshipPage';
import { BlogPage } from '../pages/BlogPage';
import { BlogDetailsPage } from '../pages/BlogDetailsPage';
import { ContactPage } from '../pages/ContactPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { StudentDashboard } from '../pages/StudentDashboard';
import { AdminDashboard } from '../pages/AdminDashboard';
import { ProfilePage } from '../pages/ProfilePage';
import { NotFoundPage, UnauthorizedPage } from '../pages/NotFoundPage';

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/services" element={<CoursesPage />} />
      <Route path="/courses" element={<CoursesPage />} />
      <Route path="/instructors" element={<InstructorPage />} />
      <Route path="/scholarships" element={<ScholarshipPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/blog/:id" element={<BlogDetailsPage />} />
      <Route path="/contact" element={<ContactPage />} />

      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

      <Route path="/student/dashboard" element={<ProtectedRoute requiredRole="STUDENT"><StudentDashboard /></ProtectedRoute>} />
      <Route path="/admin/dashboard" element={<ProtectedRoute requiredRole="ADMIN"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;
