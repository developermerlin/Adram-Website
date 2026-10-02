import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { authAPI, tokenStorage } from '../services/api';

const AuthContext = createContext(null);

const readStoredUser = () => {
  try {
    return JSON.parse(tokenStorage.user);
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => (tokenStorage.access ? readStoredUser() : null));
  // True only while we confirm a stored session on first load; forms track their own submitting state.
  const [initializing, setInitializing] = useState(() => Boolean(tokenStorage.access));

  const storeUser = useCallback((userData) => {
    tokenStorage.saveUser(userData);
    setUser(userData);
  }, []);

  const clearSession = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  // Confirm a stored session is still valid (refreshing the token if needed).
  useEffect(() => {
    if (!tokenStorage.access) return;
    authAPI
      .getProfile()
      .then(({ data }) => storeUser(data))
      .catch(() => clearSession())
      .finally(() => setInitializing(false));
  }, [storeUser, clearSession]);

  // The API client fires this when a refresh fails.
  useEffect(() => {
    window.addEventListener('auth:expired', clearSession);
    return () => window.removeEventListener('auth:expired', clearSession);
  }, [clearSession]);

  // Step 1 of sign-in: checks the password and emails a code. Returns { challenge, email, purpose }.
  const login = useCallback(async (email, password, remember = true) => {
    const { data } = await authAPI.login(email, password, remember);
    return data;
  }, []);

  // Creates the account and emails a verification code. Returns { challenge, email, purpose }.
  const register = useCallback(async (formData) => {
    const { data } = await authAPI.register(formData);
    return data;
  }, []);

  // Step 2: the emailed code. Signs in when the account is approved; otherwise returns { status } only.
  const verifyOtp = useCallback(
    async (challenge, code) => {
      const { data } = await authAPI.verifyOtp(challenge, code);
      if (data.access) {
        tokenStorage.save(data, data.remember !== false);
        storeUser(data.user);
        toast.success(`Welcome back, ${data.user.first_name}!`);
      }
      return data;
    },
    [storeUser],
  );

  // Social sign-in: the one-time code from the API is swapped for the usual token pair. Accounts with two-step
  // sign-in on get a challenge instead ({ mfa }), finished with verifyOtp and the authenticator code.
  const loginWithOAuthCode = useCallback(
    async (code, isNew) => {
      const { data } = await authAPI.oauthExchange(code);
      if (data.otp_required) return { mfa: data };
      tokenStorage.save(data, true);
      storeUser(data.user);
      toast.success(isNew ? `Welcome to ADRAM, ${data.user.first_name}!` : `Welcome back, ${data.user.first_name}!`);
      return data.user;
    },
    [storeUser],
  );

  const logout = useCallback(async () => {
    try {
      if (tokenStorage.refresh) await authAPI.logout(tokenStorage.refresh);
    } catch {
      // The token may already be invalid; signing out locally is what matters.
    } finally {
      clearSession();
      toast.success('You have been signed out.');
    }
  }, [clearSession]);

  // The update endpoint returns only the editable fields, so merge them into the stored user.
  const saveProfile = useCallback(
    async (request, message) => {
      const { data } = await request;
      const updated = { ...user, ...data, full_name: `${data.first_name} ${data.last_name}`.trim() };
      storeUser(updated);
      toast.success(message);
      return updated;
    },
    [user, storeUser],
  );

  const updateProfile = useCallback((formData) => saveProfile(authAPI.updateProfile(formData), 'Profile updated.'), [saveProfile]);
  const uploadProfilePicture = useCallback((file) => saveProfile(authAPI.uploadProfilePicture(file), 'Profile photo updated.'), [saveProfile]);
  const removeProfilePicture = useCallback(() => saveProfile(authAPI.removeProfilePicture(), 'Profile photo removed.'), [saveProfile]);

  // Re-reads the account (e.g. the server added the training side when they enrolled on a course).
  const refreshUser = useCallback(async () => {
    const { data } = await authAPI.getProfile();
    storeUser(data);
    return data;
  }, [storeUser]);

  // A student adds the training or scholarships side of the portal to their account.
  const joinTrack = useCallback(async (track) => {
    const { data } = await authAPI.joinTrack(track);
    storeUser(data);
    return data;
  }, [storeUser]);

  const changePassword = useCallback(async (payload) => {
    await authAPI.changePassword(payload);
    toast.success('Password changed.');
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      initializing,
      login,
      loginWithOAuthCode,
      verifyOtp,
      register,
      logout,
      updateProfile,
      uploadProfilePicture,
      removeProfilePicture,
      changePassword,
      refreshUser,
      joinTrack,
    }),
    [user, initializing, login, loginWithOAuthCode, verifyOtp, register, logout, updateProfile, uploadProfilePicture, removeProfilePicture, changePassword, refreshUser, joinTrack],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
