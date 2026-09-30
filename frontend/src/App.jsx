import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ScrollManager from './components/layout/ScrollManager';
import AppRoutes from './routes/AppRoutes';
import { BrandDefs } from './components/brand/BrandIcon';
import PageMeta from './content/PageMeta';
import TextOverrides from './components/admin/TextOverrides';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BrandDefs />
        <ScrollManager />
        <PageMeta />
        <TextOverrides />
        <Toaster position="top-right" toastOptions={{ style: { fontFamily: 'var(--font-body)' } }} />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
