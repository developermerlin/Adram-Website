import { Link } from 'react-router-dom';
import Layout from '../components/common/Layout';
import PageBanner from '../components/common/PageBanner';
import StatsBar from '../components/common/StatsBar';
import '../styles/pages/about.css';

export const AboutPage = () => {
  const testimonials = [
    { quote: "You can't succeed if you just do what others do and follow the well-worn path. You need to create a new and original path for yourself.", author: 'Clifford Frazier', company: 'Colorlib Themes' },
    { quote: "Education is the most powerful weapon which you can use to change the world. It opens doors and creates opportunities.", author: 'Sarah Johnson', company: 'Tech Leaders' },
  ];

  const benefits = [
    { icon: 'flaticon-business', title: 'Creative ideas base' },
    { icon: 'flaticon-communications-1', title: 'Expert instructors' },
    { icon: 'flaticon-graduated', title: 'Quality content' },
    { icon: 'flaticon-tools-and-utensils', title: 'Career support' },
  ];

  return (
    <Layout>
      <PageBanner title="About Us" />

      {/* About Details */}
      <div className="about-details section-padding30">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-8">
              <div className="about-details-cap mb-50">
                <h4>Our Mission</h4>
                <p>At ADRAM Technologies, our mission is to provide world-class education and training that empowers individuals to achieve their fullest potential. We believe in making quality education accessible to everyone, regardless of their background or circumstances.</p>
                <p>We are committed to fostering innovation, creativity, and excellence in everything we do. Our dedicated team of educators and professionals work tirelessly to create courses and learning experiences that are not only informative but also transformative.</p>
              </div>

              <div className="about-details-cap mb-50">
                <h4>Our Vision</h4>
                <p>We envision a world where quality education is accessible to everyone, breaking down barriers of geography, economics, and social status. Our vision is to be a global leader in online education, known for innovation, excellence, and positive impact on society.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <StatsBar />

      {/* Testimonials */}
      <div className="testimonial-area fix pt-180 pb-180 section-bg" style={{ backgroundImage: 'url(/assets/img/gallery/section_bg03.png)' }}>
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-xl-8 col-lg-9 col-md-9">
              {testimonials.map((testimonial, idx) => (
                <div key={idx} className="single-testimonial pt-65">
                  <div className="testimonial-icon mb-45">
                    <img src="/assets/img/gallery/testimonial.png" alt="Testimonial" />
                  </div>
                  <div className="testimonial-caption text-center">
                    <p>{testimonial.quote}</p>
                    <div className="testimonial-ratting">
                      {[...Array(5)].map((_, i) => (
                        <i key={i} className="fas fa-star"></i>
                      ))}
                    </div>
                    <div className="rattiong-caption">
                      <span>{testimonial.author}<span> - {testimonial.company}</span></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* More About */}
      <div className="about-area section-padding2">
        <div className="container">
          <div className="row">
            <div className="col-lg-6 col-md-12">
              <div className="about-caption mb-50">
                <div className="section-tittle mb-35">
                  <span>More About Our Company</span>
                  <h2>Why Choose Us?</h2>
                </div>
                <p>ADRAM Technologies stands out as a premier educational institution due to our commitment to quality, innovation, and student success. We offer cutting-edge courses designed by industry experts, providing practical skills that are immediately applicable in the real world.</p>
                <ul>
                  {benefits.map((benefit, idx) => (
                    <li key={idx}><span className={benefit.icon}></span> {benefit.title}</li>
                  ))}
                </ul>
                <Link to="/courses" className="btn">More About Us</Link>
              </div>
            </div>
            <div className="col-lg-6 col-md-12">
              <div className="about-img">
                <div className="about-font-img d-none d-lg-block">
                  <img src="/assets/img/gallery/about2.png" alt="About" />
                </div>
                <div className="about-back-img">
                  <img src="/assets/img/gallery/about1.png" alt="About" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AboutPage;
