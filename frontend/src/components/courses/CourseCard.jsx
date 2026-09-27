import { Link } from 'react-router-dom';

export const CourseCard = ({ course, className = 'mb-40' }) => {
  return (
    <div className="col-xl-4 col-lg-4 col-md-6">
      <div className={`single-course ${className}`}>
        <div className="course-img">
          <img src={course.image} alt={course.title} />
        </div>
        <div className="course-caption">
          <div className="course-cap-top">
            <h4>
              <Link to="/courses">{course.title}</Link>
            </h4>
          </div>
          <div className="course-cap-mid d-flex justify-content-between">
            <div className="course-ratting">
              {[...Array(5)].map((_, i) => (
                <i key={i} className="fas fa-star" />
              ))}
            </div>
            <ul>
              <li>{course.reviews} Review</li>
            </ul>
          </div>
          <div className="course-cap-bottom d-flex justify-content-between">
            <ul>
              <li>
                <i className="ti-user" /> {course.students}
              </li>
              <li>
                <i className="ti-heart" /> {course.likes}
              </li>
            </ul>
            <span>Free</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseCard;
