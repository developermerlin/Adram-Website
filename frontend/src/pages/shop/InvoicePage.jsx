import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { shopAPI } from '../../services/api';
import { useSite } from '../../content/useContent';
import { Spinner } from '../../components/ui/Section';
import Brand from '../../components/ui/Brand';
import { money } from '../../components/lms/courseUtils';
import { formatDate, formatDateTime } from '../../utils/format';
import '../../styles/invoice.css';

const METHOD_NAMES = { afrimoney: 'Afrimoney', orange_money: 'Orange Money', card: 'Card' };

/** A printable invoice (unpaid) or receipt (paid) for one order. */
export const InvoicePage = () => {
  const { id } = useParams();
  const site = useSite();
  const [state, setState] = useState({ order: null, missing: false });

  useEffect(() => {
    let live = true;
    shopAPI.order(id).then(({ data }) => live && setState({ order: data, missing: false })).catch(() => live && setState({ order: null, missing: true }));
    return () => {
      live = false;
    };
  }, [id]);

  const { order, missing } = state;
  if (missing) return <main className="inv-page"><p>This order could not be found. <Link to="/student/purchases">Back to your purchases</Link></p></main>;
  if (!order) return <Spinner label="Loading…" />;
  const paid = order.status === 'successful' || order.status === 'refunded';

  return (
    <main className="inv-page">
      <div className="inv-tools">
        <Link to={`/orders/${order.id}`} className="btn btn--outline btn--sm"><i className="fas fa-arrow-left" /> Back to the order</Link>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()}><i className="fas fa-print" /> Print / Save as PDF</button>
      </div>
      <article className="inv">
        <header className="inv__head">
          <div>
            <Brand />
            <p className="inv__from">{site.name}<br />{site.location}<br />{site.email}{site.phones?.[0] ? ` · ${site.phones[0]}` : ''}</p>
          </div>
          <div className="inv__title">
            <h1>{paid ? 'Receipt' : 'Invoice'}</h1>
            <dl>
              <div><dt>Order</dt><dd>{order.number}</dd></div>
              <div><dt>Date</dt><dd>{formatDate(order.created_at)}</dd></div>
              {order.paid_at && <div><dt>Paid</dt><dd>{formatDate(order.paid_at)}</dd></div>}
              <div><dt>Status</dt><dd>{order.status_display}</dd></div>
            </dl>
          </div>
        </header>

        <section className="inv__to">
          <h2>Billed to</h2>
          <p><strong>{order.billed_to.name}</strong><br />{order.billed_to.email}{order.billed_to.country ? <><br />{order.billed_to.country}</> : null}</p>
        </section>

        <table className="inv__table">
          <thead><tr><th>Course</th><th>Price</th><th>Discount</th><th>Amount</th></tr></thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>{money(item.price, order.currency)}</td>
                <td>{Number(item.discount) > 0 ? `−${money(item.discount, order.currency)}` : '—'}</td>
                <td>{money(item.amount, order.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>Subtotal</td><td>{money(order.subtotal, order.currency)}</td></tr>
            {Number(order.discount) > 0 && <tr><td colSpan={3}>Discount{order.coupon ? ` (code ${order.coupon})` : ''}</td><td>−{money(order.discount, order.currency)}</td></tr>}
            <tr className="inv__total"><td colSpan={3}>{paid ? 'Total paid' : 'Total due'}</td><td>{money(order.total, order.currency)}</td></tr>
          </tfoot>
        </table>

        <section className="inv__pay">
          <h2>Payment</h2>
          {order.method ? (
            <p>{METHOD_NAMES[order.method] || order.method}{order.transaction_id ? `, transaction ${order.transaction_id}` : ''}{order.submitted_at ? `, sent ${formatDateTime(order.submitted_at)}` : ''}</p>
          ) : (
            <p>{order.provider_label}</p>
          )}
          {order.status === 'refunded' && <p>Refunded on {formatDate(order.refunded_at)}{order.refund_reason ? `: ${order.refund_reason}` : ''}.</p>}
          {!paid && order.how_to_pay?.methods?.length > 0 && (
            <p>Pay by {order.how_to_pay.methods.map((m) => `${m.label} ${m.number}${m.name ? ` (${m.name})` : ''}`).join(' or ')}, with the reference {order.number}.</p>
          )}
        </section>
        <footer className="inv__foot">Thank you for learning with {site.name}.</footer>
      </article>
    </main>
  );
};

export default InvoicePage;
