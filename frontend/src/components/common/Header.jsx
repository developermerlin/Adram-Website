import { Link } from 'react-router-dom';

export const Header = () => {
  return (
    <header>
      <div className="header-area">
        <div className="main-header">
          {/* Header Top - Desktop Only */}
          <div className="header-top d-none d-lg-block">
            {/* Left Social */}
            <div className="header-left-social">
              <ul className="header-social">
                <li><a href="#"><i className="fab fa-twitter"></i></a></li>
                <li><a href="https://www.facebook.com/sai4ull" target="_blank" rel="noopener noreferrer"><i className="fab fa-facebook-f"></i></a></li>
                <li><a href="#"><i className="fab fa-linkedin-in"></i></a></li>
                <li><a href="#"><i className="fab fa-google-plus-g"></i></a></li>
              </ul>
            </div>
            <div className="container">
              <div className="col-xl-12">
                <div className="row d-flex justify-content-between align-items-center">
                  <div className="header-info-left">
                    <ul>
                      <span style={{ marginRight: '30px' }}>
                        <li><i className="ti-email" style={{ color: 'rgb(56, 56, 196)' }}></i> adramtechnologies@gmail.com</li>
                      </span>
                      <span>
                        <li><i className="ti-mobile" style={{ color: 'rgb(56, 56, 196)' }}></i>(+232)76978720</li>
                      </span>
                    </ul>
                  </div>
                  <div className="header-info-right">
                    <ul>
                      <li><Link to="/login"><i className="ti-user"></i>Login</Link></li>
                      <li><Link to="/register"><i className="ti-lock"></i>Register</Link></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Header Bottom - Sticky */}
          <div className="header-bottom header-sticky">
            <div className="container">
              {/* Logo Desktop */}
              <div className="logo d-none d-lg-block">
                <Link to="/"><img src="/assets/img/logo/head-logo.png" alt="ADRAM Logo" /></Link>
              </div>

              {/* Logo Mobile */}
              <div className="logo logo2 d-block d-lg-none">
                <Link to="/"><img src="/assets/img/logo/logo.png" alt="ADRAM Logo" /></Link>
              </div>

              {/* Main Menu */}
              <div className="main-menu d-none d-lg-block">
                <Navigation />
              </div>

              {/* Search */}
              <div className="header-search d-none d-lg-block">
                <form action="#">
                  <input type="text" placeholder="Search Courses" />
                  <div className="search-icon">
                    <i className="fas fa-search"></i>
                  </div>
                </form>
              </div>

              {/* Mobile Menu */}
              <div className="col-12 d-lg-none">
                <div className="mobile_menu"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

const Navigation = () => {
  return (
    <nav>
      <ul id="navigation">
        <li><Link to="/">Home</Link></li>
        <li>
          <Link to="/about">About Us</Link>
          <ul className="dropdown">
            <li><Link to="/about">Company Overview</Link></li>
            <li><a href="#mission">Mission & Vision</a></li>
            <li><a href="#vision">Leadership Team</a></li>
            <li><a href="#team">Partners</a></li>
            <li><a href="#team">Careers</a></li>
          </ul>
        </li>
        <li>
          <Link to="/services">Services</Link>
          <ul className="dropdown">
            <li><a href="#web-dev">Web Development</a></li>
            <li><a href="#mobile-dev">Mobile Development</a></li>
            <li><a href="#consulting">Computer Networking</a></li>
            <li><a href="#consulting">Software Development</a></li>
            <li><a href="#consulting">AI & Machine Learning</a></li>
            <li><a href="#consulting">IT Consultancy</a></li>
            <li><a href="#support">Digital Transformation</a></li>
          </ul>
        </li>
        <li>
          <Link to="/scholarships">Scholarships</Link>
          <ul className="dropdown">
            <li><a href="#merit">Available Scholarships</a></li>
            <li><a href="#need-based">Scholarship Categories</a></li>
            <li><a href="#application">Application Process</a></li>
            <li><a href="#application">Scholarship Requirements</a></li>
            <li><a href="#application">Countries</a></li>
            <li><a href="#application">Track Application</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
        </li>
        <li>
          <Link to="/courses">Courses</Link>
          <ul className="dropdown">
            <li><a href="#design">AI & Machine Learning</a></li>
            <li><a href="#business">Programming</a></li>
            <li><a href="#languages">Web Development</a></li>
            <li><a href="#languages">Certificate Programs</a></li>
            <li><a href="#languages">Software Engineering</a></li>
            <li><a href="#languages">Mobile App Development</a></li>
            <li><a href="#languages">Professional Training</a></li>
          </ul>
        </li>
        <li><Link to="/contact">Contact</Link></li>
      </ul>
    </nav>
  );
};

export default Header;
