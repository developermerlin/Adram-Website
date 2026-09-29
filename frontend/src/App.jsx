import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ScrollManager from './components/layout/ScrollManager';
import AppRoutes from './routes/AppRoutes';
import { BrandDefs } from './components/brand/BrandIcon';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandDefs />
        <ScrollManager />
        <Toaster position="top-right" toastOptions={{ style: { fontFamily: 'var(--font-body)' } }} />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
