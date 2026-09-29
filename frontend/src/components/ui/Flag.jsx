// Country flags from the MIT-licensed flag-icons package. Only the flags we use are imported,
// so the build doesn't ship all 270. Add an import here when a new destination is added.
import gb from 'flag-icons/flags/4x3/gb.svg';
import us from 'flag-icons/flags/4x3/us.svg';
import ca from 'flag-icons/flags/4x3/ca.svg';
import de from 'flag-icons/flags/4x3/de.svg';
import eu from 'flag-icons/flags/4x3/eu.svg';
import nl from 'flag-icons/flags/4x3/nl.svg';
import cn from 'flag-icons/flags/4x3/cn.svg';
import tr from 'flag-icons/flags/4x3/tr.svg';
import inFlag from 'flag-icons/flags/4x3/in.svg';
import BrandIcon from '../brand/BrandIcon';

const flags = { gb, us, ca, de, eu, nl, cn, tr, in: inFlag };

export const Flag = ({ code, size = 28, label }) =>
  flags[code] ? (
    <img className="flag" src={flags[code]} width={size} height={Math.round(size * 0.75)} alt={label || ''} />
  ) : (
    <span className="flag flag--globe" style={{ width: size, height: Math.round(size * 0.75) }} aria-label={label}>
      <BrandIcon name="globe" size={Math.round(size * 0.6)} />
    </span>
  );

export default Flag;
