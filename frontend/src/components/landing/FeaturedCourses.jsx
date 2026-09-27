import { Link } from 'react-router-dom';
import SectionTitle from '../common/SectionTitle';
import CourseCard from '../courses/CourseCard';

export const FeaturedCourses = ({ courses }) => {
  return (
    <div className="popular-course section-padding30">
      <div className="container">
        <SectionTitle eyebrow="Most Popular Course Of This Week" title="Our Popular Course" />
        <div className="row">
          {courses.map((course) => (
            <CourseCard key={course.title} course={course} />
          ))}
        </div>
        <div className="row">
          <div className="col-lg-12">
            <div className="browse-btn2 text-center mt-50">
              <Link to="/courses" className="btn">
                Find More Courses
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeaturedCourses;
