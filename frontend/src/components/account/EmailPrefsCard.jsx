import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAPI } from '../../services/api';
import '../../styles/campaigns.css';

/** Profile: whether to receive news and offers by email (account emails are always sent). */
export const EmailPrefsCard = () => {
  const [on, setOn] = useState(null);
  useEffect(() => {
    lmsAPI.emailPreferences().then(({ data }) => setOn(data.marketing_emails)).catch(() => {});
  }, []);
  if (on === null) return null;
  const toggle = async (value) => {
    setOn(value);
    try {
      await lmsAPI.saveEmailPreferences(value);
      toast.success(value ? 'You’ll get news and offers.' : 'No more news and offers.');
    } catch {
      setOn(!value);
      toast.error('Your choice could not be saved.');
    }
  };
  return (
    <section className="card panel email-prefs">
      <div>
        <h2 className="h3">News and offers</h2>
        <p className="muted small">New courses, discounts and events by email. Emails about your account, payments and courses are always sent.</p>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
        <span>{on ? 'On' : 'Off'}</span>
      </label>
    </section>
  );
};

export default EmailPrefsCard;
