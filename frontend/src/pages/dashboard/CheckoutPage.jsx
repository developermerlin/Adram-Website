import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { parseApiErrors, shopAPI } from '../../services/api';
import { Spinner } from '../../components/ui/Section';
import { cartChanged } from '../../components/lms/cartStore';

/**
 * /checkout/<course>: older links and emails point here. Paid courses are now bought through the cart, so this puts
 * the course in the cart and opens it (a free course goes back to its page, where the student enrols).
 */
export const CheckoutPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    let live = true;
    shopAPI.addToCart(slug)
      .then(() => {
        cartChanged();
        if (live) navigate('/cart', { replace: true });
      })
      .catch((err) => {
        if (!live) return;
        if (err.response?.data?.code === 'free_course') {
          navigate(`/courses/${slug}`, { replace: true });
          return;
        }
        const message = parseApiErrors(err).form;
        if (message) toast(message);
        navigate(err.response?.status === 404 ? '/courses' : '/cart', { replace: true });
      });
    return () => {
      live = false;
    };
  }, [slug, navigate]);

  return <Spinner label="Opening your cart…" />;
};

export default CheckoutPage;
