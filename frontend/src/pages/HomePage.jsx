import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const HomePage = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-900">
      {/* Header */}
      <header className="bg-white bg-opacity-95 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-blue-600">ADRAM Technologies</h1>
          <div className="space-x-4">
            {isAuthenticated ? (
              <>
                <span className="text-gray-700 font-semibold">Welcome, {user?.first_name}!</span>
                <Link
                  to="/student/dashboard"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                >
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-blue-600 hover:text-blue-800 font-semibold px-4 py-2 rounded-lg transition"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center text-white">
          <h2 className="text-5xl font-bold mb-6">Transform Your Future</h2>
          <p className="text-xl mb-8 text-blue-100">
            Access international scholarship opportunities and build your career with ADRAM Technologies
          </p>
          {!isAuthenticated && (
            <div className="space-x-4">
              <button
                onClick={() => navigate('/register')}
                className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg font-semibold transition"
              >
                Get Started
              </button>
              <button
                onClick={() => navigate('/login')}
                className="bg-blue-500 hover:bg-blue-400 text-white px-8 py-3 rounded-lg font-semibold transition"
              >
                Sign In
              </button>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-4xl mb-4">🎓</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Scholarship Management</h3>
            <p className="text-gray-600">
              Browse and apply for scholarships from top universities around the world.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-4xl mb-4">💼</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Professional Services</h3>
            <p className="text-gray-600">
              Expert guidance and support from experienced counsellors.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-4xl mb-4">🌍</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Global Network</h3>
            <p className="text-gray-600">
              Connect with students and institutions across the globe.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
