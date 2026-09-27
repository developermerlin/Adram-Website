import { Link } from 'react-router-dom';
import SectionTitle from '../common/SectionTitle';

export const CategoryGrid = ({ categories }) => {
  return (
    <div className="categories-area section-padding30">
      <div className="container">
        <SectionTitle eyebrow="Popular Online Courses" title="Browse All Categories" />
        <div className="row">
          {categories.map((cat) => (
            <div key={cat.title} className="col-lg-4 col-md-6 col-sm-6">
              <div className="single-cat mb-50">
                <div className="cat-icon">
                  <span className={cat.icon} />
                </div>
                <div className="cat-cap">
                  <h5>
                    <Link to="/courses">{cat.title}</Link>
                  </h5>
                  <p>{cat.desc}</p>
                  <Link to="/courses" className="read-more1">
                    Read More &gt;
                  </Link>
                </div>
              </div>
            </div>
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

export default CategoryGrid;
