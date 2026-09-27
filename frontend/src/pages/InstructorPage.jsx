import Layout from '../components/common/Layout';
import PageBanner from '../components/common/PageBanner';
import InstructorCard from '../components/instructors/InstructorCard';
import '../styles/pages/instructor.css';

export const InstructorPage = () => {
  const team = [
    { id: 1, name: 'Alexa Janathon', position: 'Faculty', image: '/assets/img/gallery/team1.png', facebook: '#', twitter: '#', website: '#' },
    { id: 2, name: 'Janathon Smith', position: 'Faculty', image: '/assets/img/gallery/team2.png', facebook: '#', twitter: '#', website: '#' },
    { id: 3, name: 'Alexa MacCalum', position: 'Faculty', image: '/assets/img/gallery/team3.png', facebook: '#', twitter: '#', website: '#' },
    { id: 4, name: 'Alexa j Watson', position: 'Faculty', image: '/assets/img/gallery/team4.png', facebook: '#', twitter: '#', website: '#' },
    { id: 5, name: 'Dr. Sarah Johnson', position: 'Lead Faculty', image: '/assets/img/gallery/team1.png', facebook: '#', twitter: '#', website: '#' },
    { id: 6, name: 'Prof. Michael Brown', position: 'Faculty', image: '/assets/img/gallery/team2.png', facebook: '#', twitter: '#', website: '#' },
    { id: 7, name: 'Dr. Emily Davis', position: 'Faculty', image: '/assets/img/gallery/team3.png', facebook: '#', twitter: '#', website: '#' },
    { id: 8, name: 'Dr. James Wilson', position: 'Faculty', image: '/assets/img/gallery/team4.png', facebook: '#', twitter: '#', website: '#' },
  ];

  return (
    <Layout>
      <PageBanner title="Our Instructors" />

      <div className="team-area pt-160 pb-160">
        <div className="container">
          <div className="row">
            {team.map((member) => (
              <InstructorCard key={member.id} member={member} />
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default InstructorPage;
