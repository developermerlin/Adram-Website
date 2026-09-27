import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export const StudentDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">ADRAM Technologies</h1>
            <p className="text-gray-600">Student Dashboard</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="font-semibold text-gray-800">{user?.full_name}</p>
              <p className="text-sm text-gray-600">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Welcome Card */}
          <div className="md:col-span-3 bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome back, {user?.first_name}!</h2>
            <p className="text-gray-600">Manage your scholarship applications and profile below.</p>
          </div>

          {/* Profile Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Profile</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Full Name</p>
                <p className="font-semibold text-gray-800">{user?.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-semibold text-gray-800">{user?.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Country</p>
                <p className="font-semibold text-gray-800">{user?.country || 'Not set'}</p>
              </div>
              <button
                onClick={() => navigate('/profile')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition mt-4"
              >
                Edit Profile
              </button>
            </div>
          </div>

          {/* Account Status Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Account Status</h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <div
                  className={`w-3 h-3 rounded-full mr-2 ${user?.is_verified ? 'bg-green-500' : 'bg-yellow-500'}`}
                ></div>
                <span className="text-gray-700">
                  {user?.is_verified ? 'Email Verified' : 'Email Not Verified'}
                </span>
              </div>
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${user?.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-gray-700">{user?.is_active ? 'Account Active' : 'Account Inactive'}</span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Member Since</p>
                <p className="font-semibold text-gray-800">
                  {new Date(user?.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full bg-blue-100 hover:bg-blue-200 text-blue-700 py-2 rounded-lg transition">
                Browse Scholarships
              </button>
              <button className="w-full bg-green-100 hover:bg-green-200 text-green-700 py-2 rounded-lg transition">
                My Applications
              </button>
              <button
                onClick={() => navigate('/profile')}
                className="w-full bg-purple-100 hover:bg-purple-200 text-purple-700 py-2 rounded-lg transition"
              >
                Security Settings
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
