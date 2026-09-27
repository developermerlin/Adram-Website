import { Link } from 'react-router-dom';

export const InstructorCard = ({ member }) => {
  return (
    <div className="col-lg-3 col-md-6 col-sm-6">
      <div className="single-team mb-30">
        <div className="team-img">
          <img src={member.image} alt={member.name} />
          <ul className="team-social">
            <li>
              <a href={member.facebook}><i className="fab fa-facebook-f" /></a>
            </li>
            <li>
              <a href={member.twitter}><i className="fab fa-twitter" /></a>
            </li>
            <li>
              <a href={member.website}><i className="fas fa-globe" /></a>
            </li>
          </ul>
        </div>
        <div className="team-caption">
          <h3>
            <Link to="/instructors">{member.name}</Link>
          </h3>
          <p>{member.position}</p>
        </div>
      </div>
    </div>
  );
};

export default InstructorCard;
