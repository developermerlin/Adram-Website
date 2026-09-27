import { useState } from 'react';
import Layout from '../components/common/Layout';
import '../styles/pages/contact.css';

export const ContactPage = () => {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [successMsg, setSuccessMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMsg(false);
    setErrorMsg(false);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/contact/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSuccessMsg(true);
        setFormData({ name: '', email: '', subject: '', message: '' });
        setTimeout(() => setSuccessMsg(false), 3000);
      } else {
        setErrorMsg(true);
      }
    } catch (error) {
      console.error('Error:', error);
      setErrorMsg(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="contact-hero">
        <div className="container">
          <h1 className="text-light">Contact Us</h1>
          <p className="text-light">Get in touch with ADRAM Technologies</p>
        </div>
      </div>

      <div className="map-container">
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <div className="map-wrapper">
                <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3948.7599999999997!2d-13.229722!3d8.465583!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xf33f6f0000000001%3A0x1234567890ab!2sFreetown%2C%20Sierra%20Leone!5e0!3m2!1sen!2ssl!4v1726920000000" allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade"></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="contact-form-section">
        <div className="container">
          <h2 style={{ marginBottom: '50px' }}>Get In Touch</h2>
          <div className="row">
            <div className="col-lg-6 col-md-12 mb-4">
              <div className="contact-form">
                <h4 style={{ marginBottom: '30px', color: '#333', fontWeight: '600' }}>Send us a Message</h4>
                {successMsg && <div className="success-message">Thank you! Your message has been sent successfully.</div>}
                {errorMsg && <div className="error-message">Oops! Something went wrong. Please try again.</div>}
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label htmlFor="name">Full Name *</label>
                    <input type="text" id="name" name="name" required placeholder="Enter your full name" value={formData.name} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email Address *</label>
                    <input type="email" id="email" name="email" required placeholder="Enter your email address" value={formData.email} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="subject">Subject *</label>
                    <input type="text" id="subject" name="subject" required placeholder="What is this about?" value={formData.subject} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="message">Message *</label>
                    <textarea id="message" name="message" required placeholder="Type your message here..." value={formData.message} onChange={handleChange}></textarea>
                  </div>
                  <button type="submit" className="btn-submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            </div>

            <div className="col-lg-6 col-md-12">
              <div className="contact-info-box">
                <h4 style={{ marginBottom: '30px', color: '#333', fontWeight: '600' }}>Contact Information</h4>
                <div className="contact-info-item">
                  <i className="fas fa-envelope"></i>
                  <div><h4>Email Address</h4><p><a href="mailto:adramtechnologies@gmail.com">adramtechnologies@gmail.com</a></p><p style={{ fontSize: '0.85rem', color: '#999' }}>We'll respond within 24 hours</p></div>
                </div>
                <div className="contact-info-item">
                  <i className="fas fa-phone"></i>
                  <div><h4>Phone Numbers</h4><p><a href="tel:+23276978720">+232 76978720</a></p><p><a href="tel:+23276827374">+232 76827374</a></p><p style={{ fontSize: '0.85rem', color: '#999' }}>Mon - Fri, 9:00 AM - 6:00 PM</p></div>
                </div>
                <div className="contact-info-item">
                  <i className="fas fa-map-marker-alt"></i>
                  <div><h4>Office Address</h4><p>Freetown, Sierra Leone</p><p style={{ fontSize: '0.85rem', color: '#999' }}>West Africa</p></div>
                </div>
                <div className="contact-info-item">
                  <i className="fas fa-clock"></i>
                  <div><h4>Office Hours</h4><p>Monday - Friday: 9:00 AM - 6:00 PM</p><p>Saturday: 10:00 AM - 4:00 PM</p><p style={{ fontSize: '0.85rem', color: '#999' }}>Sunday: Closed</p></div>
                </div>
                <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '1px solid #ddd' }}>
                  <h4 style={{ marginBottom: '20px', color: '#333', fontWeight: '600' }}>Follow Us</h4>
                  <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                    <a href="https://www.facebook.com/sai4ull" target="_blank" rel="noopener noreferrer" className="social-icon-branded" style={{ background: '#3b5998' }}><i className="fab fa-facebook-f"></i></a>
                    <a href="https://www.twitter.com" target="_blank" rel="noopener noreferrer" className="social-icon-branded" style={{ background: '#1DA1F2' }}><i className="fab fa-twitter"></i></a>
                    <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer" className="social-icon-branded" style={{ background: '#0077B5' }}><i className="fab fa-linkedin-in"></i></a>
                    <a href="https://www.instagram.com" target="_blank" rel="noopener noreferrer" className="social-icon-branded" style={{ background: 'linear-gradient(135deg,#E4405F,#F77737)' }}><i className="fab fa-instagram"></i></a>
                    <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" className="social-icon-branded" style={{ background: '#FF0000' }}><i className="fab fa-youtube"></i></a>
                    <a href="https://wa.me/23276978720" target="_blank" rel="noopener noreferrer" className="social-icon-branded" style={{ background: '#25D366' }}><i className="fab fa-whatsapp"></i></a>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '15px' }}>Connect with us on social media for updates and news</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ContactPage;
