import { Link } from 'react-router-dom';

export const NotFoundPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
      <div className="text-center text-white">
        <h1 className="text-9xl font-bold mb-4">404</h1>
        <h2 className="text-4xl font-semibold mb-4">Page Not Found</h2>
        <p className="text-xl text-blue-100 mb-8">
          The page you are looking for does not exist.
        </p>
        <Link
          to="/"
          className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg font-semibold transition inline-block"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
};

export const UnauthorizedPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
      <div className="text-center text-white">
        <h1 className="text-9xl font-bold mb-4">403</h1>
        <h2 className="text-4xl font-semibold mb-4">Unauthorized Access</h2>
        <p className="text-xl text-red-100 mb-8">
          You do not have permission to access this resource.
        </p>
        <Link
          to="/"
          className="bg-white text-red-600 hover:bg-red-50 px-8 py-3 rounded-lg font-semibold transition inline-block"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
};
