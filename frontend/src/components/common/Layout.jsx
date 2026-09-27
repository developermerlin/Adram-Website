import { useEffect } from 'react';
import Header from './Header';
import Footer from './Footer';
import Preloader from './Preloader';

export const Layout = ({ children }) => {
  // Load external JavaScript files
  useEffect(() => {
    const scripts = [
      '/assets/js/vendor/jquery-1.12.4.min.js',
      '/assets/js/popper.min.js',
      '/assets/js/bootstrap.min.js',
      '/assets/js/jquery.slicknav.min.js',
      '/assets/js/owl.carousel.min.js',
      '/assets/js/slick.min.js',
      '/assets/js/jquery.sticky.js',
      '/assets/js/jquery.magnific-popup.js',
      '/assets/js/jquery.nice-select.min.js',
      '/assets/js/jquery.counterup.min.js',
      '/assets/js/waypoints.min.js',
      '/assets/js/wow.min.js',
      '/assets/js/jquery.validate.min.js',
      '/assets/js/one-page-nav-min.js',
      '/assets/js/jquery.paroller.min.js',
      '/assets/js/plugins.js',
      '/assets/js/main.js',
    ];

    // Load scripts sequentially to maintain order
    let scriptIndex = 0;
    const loadedScripts = new Set();

    const loadNextScript = () => {
      if (scriptIndex >= scripts.length) return;

      const src = scripts[scriptIndex];
      if (loadedScripts.has(src)) {
        scriptIndex++;
        loadNextScript();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.defer = false;
      
      script.onload = () => {
        loadedScripts.add(src);
        scriptIndex++;
        loadNextScript();
      };

      script.onerror = () => {
        console.error(`Failed to load script: ${src}`);
        scriptIndex++;
        loadNextScript();
      };

      document.body.appendChild(script);
    };

    // Delay slightly to ensure DOM is ready
    const timer = setTimeout(loadNextScript, 100);

    return () => {
      clearTimeout(timer);
      // Optionally clean up loaded scripts on unmount
    };
  }, []);

  // Handle back to top button
  useEffect(() => {
    const handleScroll = () => {
      const backTopBtn = document.getElementById('back-top');
      if (backTopBtn) {
        if (window.scrollY > 100) {
          backTopBtn.style.display = 'block';
        } else {
          backTopBtn.style.display = 'none';
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <Preloader />
      <Header />
      <main>
        {children}
      </main>
      <div id="back-top">
        <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <i className="fas fa-level-up-alt"></i>
        </a>
      </div>
      <Footer />
    </>
  );
};

export default Layout;
