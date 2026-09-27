import { useState } from 'react';
import Layout from '../components/common/Layout';
import PageBanner from '../components/common/PageBanner';
import CourseCard from '../components/courses/CourseCard';
import '../styles/pages/courses.css';

export const CoursesPage = () => {
  const [activeTab, setActiveTab] = useState('all');

  const allCourses = [
    { id: 1, title: 'Graphic Design', image: '/assets/img/gallery/popular_sub1.png', reviews: 52, students: 562, likes: 562, category: 'design' },
    { id: 2, title: 'Web Development', image: '/assets/img/gallery/popular_sub2.png', reviews: 52, students: 562, likes: 562, category: 'web' },
    { id: 3, title: 'Digital Marketing', image: '/assets/img/gallery/popular_sub3.png', reviews: 52, students: 562, likes: 562, category: 'marketing' },
    { id: 4, title: 'Graphic Design Advanced', image: '/assets/img/gallery/popular_sub2.png', reviews: 52, students: 562, likes: 562, category: 'design' },
    { id: 5, title: 'Web Development Pro', image: '/assets/img/gallery/popular_sub3.png', reviews: 52, students: 562, likes: 562, category: 'web' },
    { id: 6, title: 'Digital Marketing Mastery', image: '/assets/img/gallery/popular_sub1.png', reviews: 52, students: 562, likes: 562, category: 'marketing' },
    { id: 7, title: 'UI/UX Design', image: '/assets/img/gallery/popular_sub1.png', reviews: 48, students: 480, likes: 450, category: 'design' },
    { id: 8, title: 'React.js Fundamentals', image: '/assets/img/gallery/popular_sub2.png', reviews: 55, students: 610, likes: 580, category: 'web' },
    { id: 9, title: 'SEO & Content Strategy', image: '/assets/img/gallery/popular_sub3.png', reviews: 50, students: 540, likes: 520, category: 'marketing' },
  ];

  const categories = [
    { id: 'all', name: 'All' },
    { id: 'web', name: 'Web' },
    { id: 'design', name: 'Graphic' },
    { id: 'video', name: 'Video' },
    { id: 'language', name: 'Language' },
  ];

  const filteredCourses = activeTab === 'all' ? allCourses : allCourses.filter((course) => course.category === activeTab);

  return (
    <Layout>
      <PageBanner title="All Courses" />

      <section className="all-course section-padding30">
        <div className="container">
          <div className="row">
            <div className="all-course-wrapper w-100">
              <div className="row mb-15">
                <div className="col-lg-12">
                  <div className="properties__button mb-90">
                    <nav>
                      <div className="nav nav-tabs" role="tablist">
                        {categories.map((cat) => (
                          <a
                            key={cat.id}
                            className={`nav-item nav-link ${activeTab === cat.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(cat.id)}
                            role="tab"
                            style={{ cursor: 'pointer' }}
                          >
                            {cat.name}
                          </a>
                        ))}
                      </div>
                    </nav>
                  </div>
                </div>
              </div>

              <div className="row">
                {filteredCourses.map((course) => (
                  <CourseCard key={course.id} course={course} className="mb-70" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default CoursesPage;
