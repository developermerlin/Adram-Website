const initials = (person) =>
  (person?.full_name || person?.name || `${person?.first_name || ''} ${person?.last_name || ''}`)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

// Profile photo when there is one, otherwise the person's initials.
export const Avatar = ({ person, size = 40, className = '' }) => (
  <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
    {person?.profile_picture ? <img src={person.profile_picture} alt="" /> : initials(person) || <i className="fas fa-user" />}
  </span>
);

export default Avatar;
