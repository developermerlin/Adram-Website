import Layout from '../components/common/Layout';
import HeroSlider from '../components/landing/HeroSlider';
import CategoryGrid from '../components/landing/CategoryGrid';
import FeaturedCourses from '../components/landing/FeaturedCourses';
import StatsBar from '../components/common/StatsBar';
import { landingCategories, featuredCourses } from '../data/landing';

export const LandingPage = () => {
  return (
    <Layout>
      <HeroSlider />
      <CategoryGrid categories={landingCategories} />
      <StatsBar />
      <FeaturedCourses courses={featuredCourses} />
    </Layout>
  );
};

export default LandingPage;
