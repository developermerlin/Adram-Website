import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { chatbotAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Markdown from '../blog/Markdown';
import '../../styles/chatbot.css';

const STORE = 'adram-chat';
const load = () => {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
};
const save = (data) => {
  try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* private mode */ }
};

/** "Talk to a person": WhatsApp, phone, the contact form, or Messages for signed-in visitors. */
const Handoff = ({ contact, signedIn }) => (
  <div className="cb-handoff">
    <p>Talk to a person at ADRAM:</p>
    <div className="cb-handoff__btns">
      {contact?.whatsapp && <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="cb-handoff__btn"><i className="fab fa-whatsapp" aria-hidden="true" /> WhatsApp</a>}
      {contact?.phone && <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="cb-handoff__btn"><i className="fas fa-phone" aria-hidden="true" /> Call</a>}
      {signedIn
        ? <Link to="/messages" className="cb-handoff__btn"><i className="fas fa-comments" aria-hidden="true" /> Message the team</Link>
        : <Link to="/contact" className="cb-handoff__btn"><i className="fas fa-envelope" aria-hidden="true" /> Contact form</Link>}
    </div>
  </div>
);

/** The website assistant: a chat button in the corner and the conversation panel it opens. */
export const ChatWidget = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => ({ session: null, messages: [], rated: null, ...load() }));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState(false);
  const [allShown, setAllShown] = useState(false);
  const list = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    chatbotAPI.config().then(({ data }) => setCfg(data)).catch(() => setCfg(null));
  }, []);
  useEffect(() => { save(state); }, [state]);
  useEffect(() => {
    if (open && list.current) {
      // a long answer is shown from its start, not its end
      const box = list.current;
      const last = [...box.querySelectorAll('.cb-msg')].pop();
      const top = last && last.offsetHeight > box.clientHeight * 0.8 ? last.offsetTop - 12 : box.scrollHeight;
      box.scrollTo({ top, behavior: 'smooth' });
      input.current?.focus();
    }
  }, [open, state.messages.length, busy]);
  // Escape closes the panel
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  // Make room for the chat button above "back to top"
  useEffect(() => {
    if (!cfg?.enabled) return undefined;
    document.body.classList.add('has-chatbot');
    return () => document.body.classList.remove('has-chatbot');
  }, [cfg]);

  if (!cfg?.enabled) return null;

  const send = async (question) => {
    const q = (question ?? text).trim();
    if (!q || busy) return;
    setMenu(false);
    setText('');
    setNotice('');
    setState((s) => ({ ...s, messages: [...s.messages, { role: 'user', content: q }] }));
    setBusy(true);
    try {
      const { data } = await chatbotAPI.chat({ session: state.session, message: q, page: location.pathname });
      setState((s) => ({ ...s, session: data.session, messages: [...s.messages, { role: 'assistant', content: data.reply, handoff: data.handoff }] }));
    } catch (err) {
      setNotice(err.response?.data?.detail || 'The assistant couldn’t be reached. Please try again, or contact the team below.');
      setState((s) => ({ ...s, messages: [...s.messages, { role: 'assistant', content: 'Sorry, something went wrong.', handoff: true }] }));
    } finally {
      setBusy(false);
    }
  };
  const restart = () => { setState({ session: null, messages: [], rated: null }); setMenu(false); setAllShown(false); };
  const rate = async (rating) => {
    setState((s) => ({ ...s, rated: rating }));
    chatbotAPI.rate(state.session, rating).catch(() => {});
  };
  const answered = state.messages.filter((m) => m.role === 'assistant').length;
  // the admin's ready-made questions (Admin → Chatbot → Questions & answers), else the plain suggestions
  const questions = cfg.questions?.length ? cfg.questions : cfg.suggestions;
  const first = allShown ? questions : questions.slice(0, 5);

  return (
    <>
      <button type="button" className={`cb-launch${open ? ' is-open' : ''}`} onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close the chat' : `Chat with ${cfg.name}`} aria-expanded={open} aria-controls="cb-panel">
        <i className={`fas ${open ? 'fa-xmark' : 'fa-comment-dots'}`} aria-hidden="true" />
        {!open && <span className="cb-launch__label">Ask us</span>}
      </button>

      {open && (
        <section id="cb-panel" className="cb-panel" role="dialog" aria-label={cfg.name}>
          <header className="cb-head">
            <span className="cb-head__avatar" aria-hidden="true"><i className="fas fa-headset" /></span>
            <div>
              <strong>{cfg.name}</strong>
              <small>Usually answers in seconds</small>
            </div>
            {state.messages.length > 0 && (
              <button type="button" className="cb-icon" onClick={restart} aria-label="Start a new conversation" title="New conversation"><i className="fas fa-rotate-right" /></button>
            )}
            <button type="button" className="cb-icon" onClick={() => setOpen(false)} aria-label="Close"><i className="fas fa-xmark" /></button>
          </header>

          {/* links to this website open inside it (no reload); on phones the chat then closes so the page shows */}
          <div className="cb-list" ref={list} aria-live="polite" onClick={(e) => {
            const a = e.target.closest('a');
            const href = a?.getAttribute('href') || '';
            if (href.startsWith('/') && !href.startsWith('//')) {
              e.preventDefault();
              navigate(href);
              if (window.matchMedia('(max-width: 560px)').matches) setOpen(false);
            }
          }}>
            <div className="cb-msg cb-msg--bot"><p>{cfg.greeting}</p></div>
            {state.messages.length === 0 && questions.length > 0 && (
              <div className="cb-suggest" role="group" aria-label="Common questions">
                {first.map((s) => <button key={s} type="button" onClick={() => send(s)}>{s}</button>)}
                {questions.length > first.length && (
                  <button type="button" className="cb-suggest__more" onClick={() => setAllShown(true)}>More questions ({questions.length - first.length})</button>
                )}
              </div>
            )}
            {state.messages.map((m, i) => (
              <div key={i} className={`cb-msg cb-msg--${m.role === 'user' ? 'me' : 'bot'}`}>
                {m.role === 'user' ? <p>{m.content}</p> : <div className="cb-md"><Markdown source={m.content} /></div>}
                {m.handoff && <Handoff contact={cfg.contact} signedIn={isAuthenticated} />}
              </div>
            ))}
            {busy && <div className="cb-msg cb-msg--bot cb-typing" aria-label="Typing"><span /><span /><span /></div>}
            {notice && <p className="cb-notice" role="alert">{notice}</p>}
            {answered >= 2 && state.session && (
              <div className="cb-rate">
                {state.rated ? <span>Thanks for your feedback.</span> : (
                  <>
                    <span>Was this helpful?</span>
                    <button type="button" onClick={() => rate(1)} aria-label="Helpful"><i className="far fa-thumbs-up" /></button>
                    <button type="button" onClick={() => rate(-1)} aria-label="Not helpful"><i className="far fa-thumbs-down" /></button>
                  </>
                )}
              </div>
            )}
          </div>

          {menu && (
            <div className="cb-qmenu" id="cb-qmenu">
              <div className="cb-qmenu__head"><strong>Common questions</strong>
                <button type="button" className="cb-icon" onClick={() => setMenu(false)} aria-label="Close the list"><i className="fas fa-xmark" /></button></div>
              <ul>{questions.map((s) => <li key={s}><button type="button" onClick={() => send(s)}>{s}<i className="fas fa-chevron-right" aria-hidden="true" /></button></li>)}</ul>
            </div>
          )}
          <form className="cb-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            {questions.length > 0 && state.messages.length > 0 && (
              <button type="button" className={`cb-menu${menu ? ' is-on' : ''}`} onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-controls="cb-qmenu"
                aria-label="Common questions" title="Common questions"><i className="fas fa-list-ul" /></button>
            )}
            <textarea ref={input} rows={1} value={text} maxLength={1000} placeholder="Type your question…" aria-label="Your question"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button type="submit" className="cb-send" disabled={busy || !text.trim()} aria-label="Send"><i className="fas fa-paper-plane" /></button>
          </form>
          <p className="cb-foot">{cfg.ready ? 'AI answers can be wrong. ' : ''}For quotes and applications, <Link to="/contact">contact the team</Link>.</p>
        </section>
      )}
    </>
  );
};

export default ChatWidget;
