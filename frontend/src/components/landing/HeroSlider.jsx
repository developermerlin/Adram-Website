import { Link } from 'react-router-dom';

const slides = [
  {
    eyebrow: 'Popular Online Courses',
    title: 'The New Way To Learn Properly With Us!',
    image: '/assets/img/hero/heroman.png',
  },
  {
    eyebrow: 'Scholarships & Training',
    title: 'Build Skills And Open International Opportunities',
    image: '/assets/img/hero/heroman.png',
  },
];

export const HeroSlider = () => {
  return (
    <div className="slider-area">
      <div className="slider-active">
        {slides.map((slide) => (
          <div key={slide.title} className="single-slider slider-height d-flex align-items-center">
            <div className="container">
              <div className="row align-items-center">
                <div className="col-xl-6 col-lg-7 col-md-8">
                  <div className="hero__caption">
                    <span data-animation="fadeInLeft" data-delay=".2s">{slide.eyebrow}</span>
                    <h1 data-animation="fadeInLeft" data-delay=".4s">{slide.title}</h1>
                    <div className="hero__btn">
                      <Link to="/courses" className="btn hero-btn" data-animation="fadeInLeft" data-delay=".8s">
                        Get Started
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="col-xl-6 col-lg-5">
                  <div className="hero-man d-none d-lg-block f-right" data-animation="jello" data-delay=".4s">
                    <img src={slide.image} alt="" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HeroSlider;
