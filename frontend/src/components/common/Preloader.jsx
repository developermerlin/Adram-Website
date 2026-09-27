import { useEffect } from 'react';

export const Preloader = () => {
  useEffect(() => {
    // Hide preloader after page load
    const timer = setTimeout(() => {
      const preloader = document.getElementById('preloader-active');
      if (preloader) {
        preloader.style.display = 'none';
      }
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div id="preloader-active">
      <div className="preloader d-flex align-items-center justify-content-center">
        <div className="preloader-inner position-relative">
          <div className="preloader-circle">
            <div className="preloader-img pere-text">
              <img src="/assets/img/logo/loader-logo.png" alt="Loading..." />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Preloader;
