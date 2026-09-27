import { Link } from 'react-router-dom';

export const Footer = () => {
  return (
    <footer>
      <div className="footer-area footer-bg">
        <div className="container">
          <div className="footer-top footer-padding" style={{ padding: '30px 0' }}>
            <div className="footer-heading">
              <div className="row justify-content-between align-items-center">
                {/* Newsletter Section */}
                <div className="col-xl-6 col-lg-7">
                  <div className="footer-tittle2" style={{ marginBottom: '15px' }}>
                    <h4 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '6px' }}>Stay Updated</h4>
                    <p style={{ color: '#fff', fontSize: '0.8rem', opacity: '0.85' }}>
                      Get the latest news and exclusive offers in your inbox.
                    </p>
                  </div>
                  <div className="footer-form" style={{ marginBottom: '0' }}>
                    <form
                      action="https://spondonit.us12.list-manage.com/subscribe/post?u=1462626880ade1ac87bd9c93a&id=92a4423d01"
                      method="get"
                      style={{ display: 'flex', gap: '8px', alignItems: 'stretch', maxWidth: '500px' }}
                    >
                      <input type="email" name="EMAIL" placeholder="your@email.com" required style={{flex: 1, padding: '12px 14px', border: 'none', borderRadius: '4px', fontSize: '0.9rem'}} />
                      <button type="submit" style={{padding: '0 24px', border: 'none', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', fontWeight: '600', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap'}}>Subscribe</button>
                    </form>
                    <p style={{ color: '#fff', fontSize: '0.75rem', marginTop: '10px', opacity: '0.75' }}>We respect your privacy. Unsubscribe anytime.</p>
                  </div>
                </div>

                {/* Contact Section */}
                <div className="col-xl-6 col-lg-5">
                  <div className="footer-tittle2">
                    <h4 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '8px' }}>Get In Touch</h4>
                    <p style={{ color: '#fff', fontSize: '0.8rem', opacity: '0.85', marginBottom: '15px' }}>We're here to help and answer any questions.</p>
                  </div>
                  <div style={{ fontSize: '0.9rem', lineHeight: '2' }}>
                    <p style={{ margin: '0', color: '#fff' }}>
                      <i className="fas fa-phone" style={{ color: '#667eea', marginRight: '12px', width: '18px' }}></i>
                      <span style={{ color: '#fff' }}>+232 76978720</span>
                    </p>
                    <p style={{ margin: '0', color: '#fff' }}>
                      <i className="fas fa-envelope" style={{ color: '#667eea', marginRight: '12px', width: '18px' }}></i>
                      <a href="mailto:adramtechnologies@gmail.com" style={{ color: '#fff', textDecoration: 'none' }}>adramtechnologies@gmail.com</a>
                    </p>
                    <p style={{ margin: '0', color: '#fff' }}>
                      <i className="fas fa-map-marker-alt" style={{ color: '#667eea', marginRight: '12px', width: '18px' }}></i>
                      <span style={{ color: '#fff' }}>Freetown, Sierra Leone</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bottom */}
          <div className="footer-bottom" style={{ borderTop: '1px solid rgba(255,255,255,0.15)', padding: '20px 0', marginTop: '0' }}>
            <div className="row">
              <div className="col-lg-12">
                <div className="footer-copy-right text-center">
                  <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0', opacity: '0.9' }}>
                    Copyright © 2026 ADRAM Technologies. All rights reserved | <a href="#" style={{ color: '#fff', textDecoration: 'none', opacity: '0.9' }}>Privacy Policy</a> | <a href="#" style={{ color: '#fff', textDecoration: 'none', opacity: '0.9' }}>Terms of Service</a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
