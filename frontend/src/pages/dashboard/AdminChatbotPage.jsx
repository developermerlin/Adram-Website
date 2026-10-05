import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import Markdown from '../../components/blog/Markdown';
import { chatbotAPI, parseApiErrors } from '../../services/api';
import { formatDateTime, timeAgo } from '../../utils/format';
import '../../styles/chatbot.css';

const TABS = [['settings', 'Settings', 'fa-sliders'], ['faqs', 'Questions & answers', 'fa-circle-question'], ['conversations', 'Conversations', 'fa-comments'], ['knowledge', 'What it knows', 'fa-book-open'], ['test', 'Try it', 'fa-flask']];
const fmt = new Intl.NumberFormat();

const KeyNotice = () => (
  <div className="cba-notice" role="note">
    <i className="fas fa-key" aria-hidden="true" />
    <div>
      <strong>The assistant is answering from your website content. Add an API key for full AI answers.</strong>
      <p>Create a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">console.anthropic.com</a> (add billing, then API keys → Create key).
        Paste it into <code>backend/.env</code> as <code>ANTHROPIC_API_KEY=…</code> and restart the Django server. Until then it answers common questions (services, programmes, fees, scholarships, how to apply, contact details) by itself, and offers WhatsApp, a call or the contact form for anything else.</p>
    </div>
  </div>
);

const Settings = ({ onReady }) => {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState('');
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);
  const adopt = (d) => {
    const f = { enabled: d.enabled, name: d.name, greeting: d.greeting, suggestions: d.suggestions, instructions: d.instructions,
      knowledge: d.knowledge, model: d.model, per_hour: d.per_hour, per_conversation: d.per_conversation };
    setForm(f); setSaved(JSON.stringify(f)); setMeta({ models: d.models, ready: d.ready }); onReady(d.ready);
  };
  useEffect(() => { chatbotAPI.settings().then(({ data }) => adopt(data)).catch(() => toast.error('Settings couldn’t be loaded.')); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!form) return <div className="card panel"><div className="skeleton skeleton--block" /></div>;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== saved;
  const save = async () => {
    setBusy(true);
    try { const { data } = await chatbotAPI.saveSettings(form); adopt(data); toast.success('Saved. The assistant uses the new settings straight away.'); }
    catch (err) { toast.error(err.response?.data?.detail || parseApiErrors(err).detail || 'Could not save.'); }
    finally { setBusy(false); }
  };
  const field = (k, label, opts = {}) => (
    <label className="field" htmlFor={`cba-${k}`}>
      <span className="field__label">{label}</span>
      {opts.rows ? <textarea id={`cba-${k}`} className="input" rows={opts.rows} maxLength={opts.max} value={form[k]} placeholder={opts.placeholder} onChange={(e) => set(k)(e.target.value)} />
        : <input id={`cba-${k}`} className="input" type={opts.type || 'text'} maxLength={opts.max} value={form[k]} placeholder={opts.placeholder} onChange={(e) => set(k)(e.target.value)} />}
      {opts.hint && <small className="hint">{opts.hint}</small>}
    </label>
  );
  return (
    <div className="cba-grid">
      <div className="cba-col">
        <section className="card panel cba-card">
          <h2 className="h3">The assistant</h2>
          <label className="checkbox">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled')(e.target.checked)} />
            <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
            <span>Show the chat button on the website<small>Turn it off any time; visitors then see no chat button.</small></span>
          </label>
          {field('name', 'Name', { max: 60, placeholder: 'ADRAM Assistant' })}
          {field('greeting', 'First message', { rows: 2, max: 300 })}
          <div className="field">
            <span className="field__label">Suggested questions</span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input key={i} className="input cba-suggest" value={form.suggestions[i] || ''} maxLength={120} placeholder={i < 4 ? `Question ${i + 1}` : 'Optional'}
                aria-label={`Suggested question ${i + 1}`} onChange={(e) => { const next = [...form.suggestions]; next[i] = e.target.value; set('suggestions')(next); }} />
            ))}
            <small className="hint">Used only if no question in <em>Questions & answers</em> is set to show as a button.</small>
          </div>
        </section>
        <section className="card panel cba-card">
          <h2 className="h3">What it should know and do</h2>
          {field('knowledge', 'Extra facts and FAQs', { rows: 8, max: 20000, placeholder: 'e.g. We are closed on public holidays.\nTraining starts every first Monday of the month.\nWe accept Orange Money and bank transfer.',
            hint: 'It already knows your services, programmes, scholarships, blog, team and contact details from the website. Add anything else here.' })}
          {field('instructions', 'Rules', { rows: 5, max: 4000, placeholder: 'e.g. Never quote prices for website projects; ask them to request a quote.\nAlways mention our WhatsApp for urgent questions.',
            hint: 'How it should behave. It already avoids promising scholarships and never asks for passwords or payment details.' })}
        </section>
      </div>
      <div className="cba-col">
        <section className="card panel cba-card">
          <h2 className="h3">Model and limits</h2>
          <label className="field" htmlFor="cba-model"><span className="field__label">AI model</span>
            <select id="cba-model" className="input" value={form.model} onChange={(e) => set('model')(e.target.value)}>
              {meta.models.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <small className="hint">Haiku is fast and cheapest, and is plenty for website questions.</small>
          </label>
          {field('per_hour', 'Messages per visitor per hour', { type: 'number', hint: 'Stops one person running up your bill.' })}
          {field('per_conversation', 'Messages per conversation', { type: 'number' })}
        </section>
        <div className="cba-save">
          {dirty && <span className="tpe-unsaved"><i className="fas fa-circle" /> Unsaved changes</span>}
          <button type="button" className="btn btn--primary" disabled={!dirty || busy} onClick={save}>{busy ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save</button>
        </div>
      </div>
    </div>
  );
};

const BLOCKS = [['{services}', 'list of services'], ['{courses}', 'training programmes with fees'], ['{scholarships}', 'open scholarships'],
  ['{contact}', 'phones, WhatsApp, email and hours'], ['{hours}', 'opening hours']];
const blank = () => ({ id: '', question: '', answer: '', keywords: '', show: true, handoff: false, isNew: Date.now() });
const strip = (list) => list.map(({ isNew, ...r }) => r); // eslint-disable-line no-unused-vars

/** Ready-made questions: tapped as buttons or typed by visitors, answered exactly as written here. */
const Faqs = () => {
  const [rows, setRows] = useState(null);
  const [saved, setSaved] = useState('');
  const [defaults, setDefaults] = useState([]);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const adopt = (d) => { setRows(d.faqs); setSaved(JSON.stringify(d.faqs)); setDefaults(d.default_faqs || []); };
  useEffect(() => { chatbotAPI.settings().then(({ data }) => adopt(data)).catch(() => toast.error('Questions couldn’t be loaded.')); }, []);
  if (!rows) return <div className="card panel"><div className="skeleton skeleton--block" /></div>;
  const dirty = JSON.stringify(strip(rows)) !== saved;
  const keyOf = (r) => r.id || r.isNew;
  const edit = (i, k, v) => setRows((list) => list.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  const move = (i, by) => setRows((list) => { const next = [...list]; [next[i], next[i + by]] = [next[i + by], next[i]]; return next; });
  const remove = (i) => { if (window.confirm(`Delete “${rows[i].question || 'this question'}”?`)) setRows((list) => list.filter((_, n) => n !== i)); };
  const add = () => { const r = blank(); setRows((list) => [r, ...list]); setOpen(r.isNew); setQ(''); };
  const restore = () => {
    if (window.confirm('Replace all questions with the original set? Your own questions will be removed when you save.')) { setRows(defaults); setOpen(null); }
  };
  const save = async () => {
    setBusy(true);
    try { const { data } = await chatbotAPI.saveSettings({ faqs: strip(rows) }); adopt(data); toast.success('Saved. Visitors get these answers straight away.'); }
    catch (err) { toast.error(err.response?.data?.detail || 'Could not save.'); }
    finally { setBusy(false); }
  };
  const term = q.trim().toLowerCase();
  const visible = rows.map((r, i) => [r, i]).filter(([r]) => !term || `${r.question} ${r.answer} ${r.keywords}`.toLowerCase().includes(term));
  return (
    <section className="card panel cba-card">
      <div className="cba-faq-top">
        <div>
          <h2 className="h3">Questions & answers</h2>
          <p className="muted small">The assistant gives these answers word for word, with or without an AI key. Questions marked <em>Button</em> are offered to visitors to tap; the others are answered when someone types something similar.</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={add}><i className="fas fa-plus" /> Add a question</button>
      </div>
      <div className="cba-filters">
        <input className="input" type="search" placeholder="Search questions and answers…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search questions" />
        <span className="muted small">{rows.length} question{rows.length === 1 ? '' : 's'} · {rows.filter((r) => r.show).length} shown as buttons</span>
      </div>
      <ol className="cba-faqs">
        {visible.length === 0 && <li className="cba-empty muted">{rows.length ? 'No question matches your search.' : 'No questions yet. Add one, or restore the original set.'}</li>}
        {visible.map(([r, i]) => {
          const isOpen = open === keyOf(r);
          return (
            <li key={keyOf(r)} className={`cba-faq${isOpen ? ' is-open' : ''}`}>
              <div className="cba-faq__row">
                <button type="button" className="cba-faq__toggle" onClick={() => setOpen(isOpen ? null : keyOf(r))} aria-expanded={isOpen}>
                  <i className={`fas fa-chevron-${isOpen ? 'down' : 'right'}`} aria-hidden="true" />
                  <strong>{r.question || <span className="muted">New question</span>}</strong>
                </button>
                <span className="cba-faq__tags">
                  {r.show && <span className="badge badge--blue">Button</span>}
                  {r.handoff && <span className="badge badge--amber">Offers a person</span>}
                </span>
                <span className="cba-faq__tools">
                  <button type="button" className="cb-icon" disabled={i === 0 || !!term} onClick={() => move(i, -1)} aria-label="Move up" title="Move up"><i className="fas fa-arrow-up" /></button>
                  <button type="button" className="cb-icon" disabled={i === rows.length - 1 || !!term} onClick={() => move(i, 1)} aria-label="Move down" title="Move down"><i className="fas fa-arrow-down" /></button>
                  <button type="button" className="cb-icon text-danger" onClick={() => remove(i)} aria-label="Delete" title="Delete"><i className="fas fa-trash-can" /></button>
                </span>
              </div>
              {isOpen && (
                <div className="cba-faq__edit">
                  <label className="field"><span className="field__label">Question</span>
                    <input className="input" maxLength={200} value={r.question} placeholder="e.g. Do you accept Orange Money?" onChange={(e) => edit(i, 'question', e.target.value)} /></label>
                  <div className="field"><label className="field__label" htmlFor={`faq-a-${keyOf(r)}`}>Answer</label>
                    <textarea id={`faq-a-${keyOf(r)}`} className="input" rows={6} maxLength={4000} value={r.answer} onChange={(e) => edit(i, 'answer', e.target.value)}
                      placeholder="Write the answer. Use **bold**, lists starting with - and links like [contact form](/contact)." />
                    <small className="hint">Live content you can add: {BLOCKS.map(([b, l], n) => (
                      <span key={b}>{n > 0 && ', '}<button type="button" className="cba-block" title={`Insert the ${l}`}
                        onClick={() => edit(i, 'answer', `${r.answer}${r.answer && !r.answer.endsWith('\n') ? '\n\n' : ''}${b}`)}>{b}</button> {l}</span>
                    ))}. It always shows what is on the website now.</small>
                  </div>
                  <label className="field"><span className="field__label">Other ways people ask (optional)</span>
                    <input className="input" maxLength={300} value={r.keywords} placeholder="e.g. orange money, mobile money, payment methods" onChange={(e) => edit(i, 'keywords', e.target.value)} />
                    <small className="hint">Words or phrases, separated by commas. Single words only match very short messages, so phrases work best.</small></label>
                  <div className="cba-faq__checks">
                    <label className="checkbox"><input type="checkbox" checked={r.show} onChange={(e) => edit(i, 'show', e.target.checked)} />
                      <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span><span>Show as a button visitors can tap</span></label>
                    <label className="checkbox"><input type="checkbox" checked={r.handoff} onChange={(e) => edit(i, 'handoff', e.target.checked)} />
                      <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span><span>Also show WhatsApp / Call / Contact buttons</span></label>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="cba-save">
        {defaults.length > 0 && <button type="button" className="btn btn--text btn--sm" onClick={restore}><i className="fas fa-rotate-left" /> Restore the original questions</button>}
        <span className="cba-save__gap" />
        {dirty && <span className="tpe-unsaved"><i className="fas fa-circle" /> Unsaved changes</span>}
        <button type="button" className="btn btn--primary" disabled={!dirty || busy} onClick={save}>{busy ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save</button>
      </div>
    </section>
  );
};

const Conversations = () => {
  const [q, setQ] = useState('');
  const [onlyHandoff, setOnlyHandoff] = useState(false);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => chatbotAPI.conversations({ q: q || undefined, handoff: onlyHandoff ? 1 : undefined }).then(({ data: d }) => setData(d)).catch(() => {}), [q, onlyHandoff]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const show = async (id) => { const { data: d } = await chatbotAPI.conversation(id); setOpen(d); };
  const remove = async (id) => {
    if (!window.confirm('Delete this conversation?')) return;
    await chatbotAPI.removeConversation(id); setOpen(null); load(); toast.success('Deleted.');
  };
  const f = data?.figures;
  return (
    <>
      {f && (
        <div className="tma-stats">
          <div><strong>{fmt.format(f.conversations)}</strong><span>Conversations (30 days)</span></div>
          <div><strong>{fmt.format(f.questions)}</strong><span>Questions asked</span></div>
          <div><strong>{fmt.format(f.handoffs)}</strong><span>Sent to the team</span></div>
          <div><strong>{f.helpful + f.unhelpful ? `${Math.round((f.helpful / (f.helpful + f.unhelpful)) * 100)}%` : '—'}</strong><span>Rated helpful ({f.helpful + f.unhelpful} ratings)</span></div>
        </div>
      )}
      <div className="cba-filters">
        <input className="input" type="search" placeholder="Search what people asked…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" />
        <label className="checkbox"><input type="checkbox" checked={onlyHandoff} onChange={(e) => setOnlyHandoff(e.target.checked)} />
          <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span><span>Only those sent to the team</span></label>
      </div>
      <div className="cba-convos">
        <ul className="card cba-list">
          {data?.results.length === 0 && <li className="cba-empty muted">No conversations yet.</li>}
          {data?.results.map((s) => (
            <li key={s.id}>
              <button type="button" className={open?.id === s.id ? 'is-active' : ''} onClick={() => show(s.id)}>
                <strong>{s.first || '(no question)'}</strong>
                <small>{s.user ? s.user.name : 'Visitor'} · {s.messages} message{s.messages === 1 ? '' : 's'} · {timeAgo(s.last_at)}
                  {s.handoff && <span className="badge badge--amber">To team</span>}{s.rating === 1 && <i className="fas fa-thumbs-up" title="Helpful" />}{s.rating === -1 && <i className="fas fa-thumbs-down" title="Not helpful" />}</small>
              </button>
            </li>
          ))}
        </ul>
        <section className="card cba-transcript">
          {!open ? <p className="muted cba-empty">Choose a conversation to read it.</p> : (
            <>
              <header>
                <div><strong>{open.user ? `${open.user.name} (${open.user.email})` : 'Visitor'}</strong>
                  <small>Started {formatDateTime(open.started_at)}{open.page && ` on ${open.page}`}</small></div>
                <button type="button" className="btn btn--text btn--sm text-danger" onClick={() => remove(open.id)}><i className="fas fa-trash-can" /> Delete</button>
              </header>
              <div className="cb-list cba-thread">
                {open.transcript.map((m, i) => (
                  <div key={i} className={`cb-msg cb-msg--${m.role === 'user' ? 'me' : 'bot'}`}>
                    {m.role === 'user' ? <p>{m.content}</p> : <div className="cb-md"><Markdown source={m.content} /></div>}
                    {m.failed && <small className="text-danger">Not answered by the AI (fallback message)</small>}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
};

const Knowledge = () => {
  const [data, setData] = useState(null);
  useEffect(() => { chatbotAPI.knowledge().then(({ data: d }) => setData(d)).catch(() => {}); }, []);
  return (
    <section className="card panel cba-card">
      <h2 className="h3">What the assistant knows</h2>
      <p className="muted small">Built from your website every few minutes: services, published programmes and scholarships, blog articles, published team profiles, contact details, and your extra facts. To change an answer, change the website (or add a fact in Settings).</p>
      {data ? <pre className="cba-knowledge">{data.text}</pre> : <div className="skeleton skeleton--block" />}
      {data && <small className="muted">{fmt.format(data.characters)} characters</small>}
    </section>
  );
};

const TryIt = ({ ready }) => {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const ask = async (e) => {
    e.preventDefault();
    setBusy(true); setAnswer(null);
    try { const { data } = await chatbotAPI.test(q); setAnswer(data); }
    catch (err) { toast.error(err.response?.data?.detail || 'No answer.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="card panel cba-card">
      <h2 className="h3">Try the assistant</h2>
      <p className="muted small">Ask anything a visitor might. Nothing here is saved or counted.</p>
      {!ready && <KeyNotice />}
      <form className="cba-try" onSubmit={ask}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How much is the web development course?" aria-label="Question" />
        <button type="submit" className="btn btn--primary" disabled={busy || !q.trim()}>{busy ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Ask</button>
      </form>
      {answer && (
        <div className="cb-msg cb-msg--bot cba-answer">
          <div className="cb-md"><Markdown source={answer.reply} /></div>
          {answer.faq && <small className="muted">Answered from Questions & answers: “{answer.faq}”.</small>}
          {answer.built_in && <small className="muted">Built-in answer (no AI key yet).</small>}
          {answer.handoff && <small className="muted">It would also show the “talk to a person” options.</small>}
        </div>
      )}
    </section>
  );
};

/** Admin → Chatbot */
export const AdminChatbotPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'settings';
  const [ready, setReady] = useState(true);
  return (
    <PortalLayout title="Chatbot" subtitle="The assistant that answers visitors’ questions on the website, using your own content.">
      {!ready && <KeyNotice />}
      <div className="tabs" role="tablist" aria-label="Chatbot">
        {TABS.map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tabs__tab${tab === id ? ' is-active' : ''}`} onClick={() => setParams(id === 'settings' ? {} : { tab: id })}>
            <i className={`fas ${icon}`} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {tab === 'settings' && <Settings onReady={setReady} />}
      {tab === 'faqs' && <Faqs />}
      {tab === 'conversations' && <Conversations />}
      {tab === 'knowledge' && <Knowledge />}
      {tab === 'test' && <TryIt ready={ready} />}
    </PortalLayout>
  );
};

export default AdminChatbotPage;
