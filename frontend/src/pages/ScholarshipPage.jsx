import { Link } from 'react-router-dom';
import Layout from '../components/common/Layout';
import PageBanner from '../components/common/PageBanner';
import '../styles/pages/scholarship.css';

export const ScholarshipPage = () => {
  const scholarships = [
    { icon: 'flaticon-web-design', title: 'Merit-Based Scholarships', desc: 'Awarded to students with outstanding academic achievements and test scores.' },
    { icon: 'flaticon-education', title: 'Need-Based Scholarships', desc: 'Financial assistance for students who demonstrate financial need.' },
    { icon: 'flaticon-communications', title: 'Talent Scholarships', desc: 'Recognition for students excelling in sports, arts, music, and other talents.' },
    { icon: 'flaticon-computing', title: 'International Scholarships', desc: 'Special programs for international students from developing countries.' },
    { icon: 'flaticon-tools-and-utensils', title: 'Women in STEM', desc: 'Dedicated scholarships to support women pursuing technology and science.' },
    { icon: 'flaticon-business', title: 'Career Development', desc: 'Funding for professional development and career enhancement programs.' },
  ];

  const requirements = [
    'High School Diploma or Equivalent',
    'Minimum GPA of 3.0',
    'Valid TOEFL/IELTS Score',
    'Statement of Purpose',
    'Two Reference Letters',
    'Financial Documentation',
  ];

  const benefits = [
    { title: 'Tuition Coverage', desc: '50-100% of program fees' },
    { title: 'Living Allowance', desc: 'Monthly stipend for accommodation' },
    { title: 'Materials Support', desc: 'Books and course materials' },
    { title: 'Health Insurance', desc: 'Comprehensive coverage included' },
  ];

  return (
    <Layout>
      <PageBanner title="Scholarships & Financial Aid" />

      {/* Scholarship Types */}
      <div className="categories-area section-padding30">
        <div className="container">
          <div className="row justify-content-sm-center">
            <div className="cl-xl-7 col-lg-8 col-md-10">
              <div className="section-tittle text-center mb-70">
                <span>Available Programs</span>
                <h2>Scholarship Categories</h2>
              </div>
            </div>
          </div>
          <div className="row">
            {scholarships.map((scholarship, idx) => (
              <div key={idx} className="col-lg-4 col-md-6 col-sm-6">
                <div className="single-cat mb-50">
                  <div className="cat-icon">
                    <span className={scholarship.icon}></span>
                  </div>
                  <div className="cat-cap">
                    <h5><Link to="/scholarships">{scholarship.title}</Link></h5>
                    <p>{scholarship.desc}</p>
                    <Link to="/scholarships" className="read-more1">Learn More &gt;</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Application Requirements */}
      <div className="section-padding30" style={{ background: '#f8f9fa' }}>
        <div className="container">
          <div className="row">
            <div className="col-lg-6 col-md-12">
              <div className="about-caption mb-50">
                <div className="section-tittle mb-35">
                  <span>What You Need</span>
                  <h2>Application Requirements</h2>
                </div>
                <p>To apply for our scholarships, you'll need to prepare the following documents and meet these requirements:</p>
                <ul>
                  {requirements.map((req, idx) => (
                    <li key={idx}><i className="fas fa-check"></i> {req}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="col-lg-6 col-md-12">
              <div className="about-caption mb-50">
                <div className="section-tittle mb-35">
                  <span>Scholarship Benefits</span>
                  <h2>What's Included</h2>
                </div>
                <p>Our comprehensive scholarships cover various aspects of your education and living expenses:</p>
                <div style={{ marginTop: '30px' }}>
                  {benefits.map((benefit, idx) => (
                    <div key={idx} style={{ marginBottom: '25px' }}>
                      <h5 style={{ color: '#2c3e50', marginBottom: '8px' }}>{benefit.title}</h5>
                      <p style={{ color: '#666', marginBottom: 0 }}>{benefit.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Application Process */}
      <div className="section-padding30">
        <div className="container">
          <div className="row justify-content-center">
            <div className="col-lg-10">
              <div className="section-tittle text-center mb-70">
                <span>Simple Steps</span>
                <h2>Application Process</h2>
              </div>
            </div>
          </div>
          <div className="row">
            <div className="col-lg-3 col-md-6 col-sm-6 text-center">
              <div style={{ padding: '30px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '30px' }}>
                <h4 style={{ fontSize: '2.5rem', color: '#3498db', marginBottom: '15px' }}>1</h4>
                <h5 style={{ marginBottom: '10px' }}>Create Account</h5>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>Register and set up your profile</p>
              </div>
            </div>
            <div className="col-lg-3 col-md-6 col-sm-6 text-center">
              <div style={{ padding: '30px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '30px' }}>
                <h4 style={{ fontSize: '2.5rem', color: '#3498db', marginBottom: '15px' }}>2</h4>
                <h5 style={{ marginBottom: '10px' }}>Submit Documents</h5>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>Upload required documents</p>
              </div>
            </div>
            <div className="col-lg-3 col-md-6 col-sm-6 text-center">
              <div style={{ padding: '30px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '30px' }}>
                <h4 style={{ fontSize: '2.5rem', color: '#3498db', marginBottom: '15px' }}>3</h4>
                <h5 style={{ marginBottom: '10px' }}>Application Review</h5>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>We evaluate your application</p>
              </div>
            </div>
            <div className="col-lg-3 col-md-6 col-sm-6 text-center">
              <div style={{ padding: '30px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '30px' }}>
                <h4 style={{ fontSize: '2.5rem', color: '#3498db', marginBottom: '15px' }}>4</h4>
                <h5 style={{ marginBottom: '10px' }}>Get Results</h5>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>Receive decision notification</p>
              </div>
            </div>
          </div>
          <div className="row" style={{ marginTop: '40px' }}>
            <div className="col-lg-12 text-center">
              <Link to="/contact" className="btn" style={{ marginRight: '15px' }}>Apply Now</Link>
              <Link to="/contact" className="btn btn-secondary">Ask Questions</Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ScholarshipPage;
