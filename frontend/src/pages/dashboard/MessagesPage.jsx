import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { contactAPI } from '../../services/api';
import { formatDateTime, timeAgo } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import Avatar from '../../components/ui/Avatar';
import { Alert } from '../../components/ui/Form';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { EnquiryStats } from '../../components/admin/EngagementStats';

const FILTERS = [
  { id: 'all', label: 'All', isRead: undefined },
  { id: 'unread', label: 'Unread', isRead: false },
  { id: 'read', label: 'Read', isRead: true },
];

// "29 Sep 2026, 9:21 AM" in the list; "Tuesday, 29 September 2026 at 9:21 AM" when reading.
const listDateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fullDateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Deleting is permanent, so every delete (one message or several) is confirmed first.
const deleteConfirm = (count) => ({
  title: count === 1 ? 'Delete this enquiry?' : `Delete ${count} enquiries?`,
  text: 'Deleted enquiries are removed permanently and can’t be restored.',
  confirm: count === 1 ? 'Delete permanently' : `Delete ${count} permanently`,
});

const MessageDetail = ({ message, onBack, onToggleRead, onDelete }) => {
  const replyHref = `mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`;

  return (
    <article className="inbox__detail">
      <div className="inbox__detail-bar">
        <button type="button" className="btn btn--text btn--sm inbox__back" onClick={onBack}>
          <i className="fas fa-arrow-left" /> Inbox
        </button>
        <div className="inbox__detail-actions">
          <button type="button" className="btn btn--outline btn--sm" onClick={onToggleRead}>
            <i className={`fas ${message.is_read ? 'fa-envelope' : 'fa-envelope-open'}`} /> Mark as {message.is_read ? 'unread' : 'read'}
          </button>
          <button type="button" className="btn btn--outline btn--sm btn--danger-outline btn--icon-only" onClick={onDelete}
            aria-label="Delete this enquiry" title="Delete">
            <i className="fas fa-trash-can" />
          </button>
        </div>
      </div>

      <h2 className="inbox__subject">{message.subject}</h2>
      <div className="inbox__from">
        <Avatar person={message} size={44} />
        <div>
          <strong>{message.name}</strong>
          <a href={`mailto:${message.email}`}>{message.email}</a>
        </div>
        <time dateTime={message.created_at} title={formatDateTime(message.created_at)}>{timeAgo(message.created_at)}</time>
      </div>
      <p className="inbox__sent">
        <i className="far fa-calendar" aria-hidden="true" /> Sent on <strong>{fullDateFmt.format(new Date(message.created_at))}</strong>
      </p>
      <div className="inbox__body">{message.message}</div>
      <a href={replyHref} className="btn btn--primary">
        <i className="fas fa-reply" /> Reply by email
      </a>
    </article>
  );
};

export const MessagesPage = () => {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, results: [], count: 0, next: null, previous: null });
  const selectedId = Number(params.get('open')) || null;

  const load = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true }));
    return contactAPI
      .listMessages({ page, search, isRead: FILTERS.find((f) => f.id === filter).isRead })
      .then(({ data }) => setState({ loading: false, ...data }))
      .catch(() => setState((prev) => ({ ...prev, loading: false, error: 'Could not load messages.' })));
  }, [page, search, filter]);

  useEffect(() => {
    const timer = setTimeout(load, 250); // debounce the search box
    return () => clearTimeout(timer);
  }, [load]);

  // Optimistic: flip the flag locally, roll back if the API refuses.
  const setRead = useCallback(async (message, isRead) => {
    const patch = (value) =>
      setState((prev) => ({ ...prev, results: prev.results.map((m) => (m.id === message.id ? { ...m, is_read: value } : m)) }));
    patch(isRead);
    try {
      await contactAPI.setRead(message.id, isRead);
    } catch {
      patch(message.is_read);
      toast.error('Could not update the message.');
    }
  }, []);

  const selected = state.results.find((m) => m.id === selectedId);

  // Opening a message (from the list or a dashboard link) marks it read, once, so "Mark as unread" sticks.
  const autoMarked = useRef(null);
  useEffect(() => {
    if (selected && !selected.is_read && autoMarked.current !== selected.id) {
      autoMarked.current = selected.id;
      setRead(selected, true);
    }
  }, [selected, setRead]);

  const open = (message) => setParams({ open: message.id });

  const close = () => setParams({});

  // Ticked in the list, for deleting several at once.
  const [checked, setChecked] = useState([]);
  const [deleting, setDeleting] = useState(null); // ids waiting for confirmation
  const pageIds = state.results.map((m) => m.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => checked.includes(id));
  const toggleCheck = (id) => setChecked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const remove = async (ids) => {
    const results = await Promise.allSettled(ids.map((id) => contactAPI.deleteMessage(id)));
    const done = results.filter((r) => r.status === 'fulfilled').length;
    if (done) toast.success(done === 1 ? 'Enquiry deleted.' : `${done} enquiries deleted.`);
    if (done < ids.length) toast.error(`${ids.length - done} couldn’t be deleted. Try again.`);
    if (ids.includes(selectedId)) close();
    setChecked((cur) => cur.filter((id) => !ids.includes(id)));
    setDeleting(null);
    load();
  };

  return (
    <PortalLayout title="Enquiries" subtitle="Enquiries sent through the website contact form.">
      <EnquiryStats refreshKey={state} />
      <div className={`card inbox${selected ? ' has-selection' : ''}`}>
        <div className="inbox__list">
          <div className="inbox__toolbar">
            <div className="segmented" role="tablist" aria-label="Filter messages">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  className={filter === f.id ? 'is-active' : ''}
                  onClick={() => {
                    setFilter(f.id);
                    setPage(1);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="input-icon">
              <i className="fas fa-magnifying-glass" aria-hidden="true" />
              <input
                type="search"
                className="input"
                placeholder="Search messages"
                aria-label="Search messages"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {state.error && <Alert>{state.error}</Alert>}

          {state.results.length > 0 && (
            <div className={`inbox__bulk${checked.length ? ' is-active' : ''}`}>
              <label className="inbox__check">
                <input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? [] : pageIds)} aria-label="Select all on this page" />
                <span>{checked.length ? `${checked.length} selected` : 'Select all'}</span>
              </label>
              {checked.length > 0 && (
                <>
                  <button type="button" className="btn btn--text btn--sm" onClick={() => setChecked([])}>Clear</button>
                  <button type="button" className="btn btn--danger btn--sm btn--icon-only" onClick={() => setDeleting(checked)}
                    aria-label="Delete selected enquiries" title="Delete selected">
                    <i className="fas fa-trash-can" />
                  </button>
                </>
              )}
            </div>
          )}

          <ul className={`inbox__items${state.loading ? ' is-loading' : ''}`}>
            {!state.loading && state.results.length === 0 && (
              <li className="inbox__empty">
                <i className="fas fa-inbox" />
                <p>{search || filter !== 'all' ? 'No messages match.' : 'No messages yet.'}</p>
              </li>
            )}
            {state.results.map((m) => (
              <li key={m.id} className={`inbox__row${checked.includes(m.id) ? ' is-checked' : ''}`}>
                <input
                  type="checkbox"
                  className="inbox__row-check"
                  checked={checked.includes(m.id)}
                  onChange={() => toggleCheck(m.id)}
                  aria-label={`Select the enquiry from ${m.name}`}
                />
                <button
                  type="button"
                  className={`inbox__item${m.is_read ? '' : ' is-unread'}${m.id === selectedId ? ' is-selected' : ''}`}
                  onClick={() => open(m)}
                >
                  <span className="inbox__item-top">
                    <strong>{m.name}</strong>
                    <time dateTime={m.created_at} title={fullDateFmt.format(new Date(m.created_at))}>{timeAgo(m.created_at)}</time>
                  </span>
                  <span className="inbox__item-subject">{m.subject}</span>
                  <span className="inbox__item-preview">{m.message}</span>
                  <span className="inbox__item-date">
                    <i className="far fa-clock" aria-hidden="true" /> {listDateFmt.format(new Date(m.created_at))}
                  </span>
                </button>
                <button type="button" className="icon-btn inbox__row-delete" onClick={() => setDeleting([m.id])} aria-label={`Delete the enquiry from ${m.name}`} title="Delete">
                  <i className="fas fa-trash-can" />
                </button>
              </li>
            ))}
          </ul>

          {(state.next || state.previous) && (
            <div className="inbox__pager">
              <button type="button" className="btn btn--outline btn--sm" disabled={!state.previous || state.loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <i className="fas fa-chevron-left" />
              </button>
              <span className="muted">Page {page}</span>
              <button type="button" className="btn btn--outline btn--sm" disabled={!state.next || state.loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <i className="fas fa-chevron-right" />
              </button>
            </div>
          )}
        </div>

        {selected ? (
          <MessageDetail
            key={selected.id}
            message={selected}
            onBack={close}
            onToggleRead={() => setRead(selected, !selected.is_read)}
            onDelete={() => setDeleting([selected.id])}
          />
        ) : (
          <div className="inbox__placeholder">
            <i className="fas fa-envelope-open-text" />
            <p>Select a message to read it.</p>
          </div>
        )}
      </div>

      {deleting && (
        <ConfirmDialog config={deleteConfirm(deleting.length)} onClose={() => setDeleting(null)} onConfirm={() => remove(deleting)} />
      )}
    </PortalLayout>
  );
};

export default MessagesPage;
