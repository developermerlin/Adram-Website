import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { parseApiErrors, portalAPI } from '../services/api';

/**
 * The signed-in student's portal (/portal/me/): study goals, saved scholarships, applications and
 * recommendations, plus the actions that change them. `data` is null for visitors and staff.
 */
export const usePortal = () => {
  const { user } = useAuth();
  const isStudent = user?.role === 'STUDENT';
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const reload = useCallback(() => {
    if (!isStudent) return Promise.resolve();
    return portalAPI
      .me()
      .then(({ data: d }) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, [isStudent]);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (request, success) => {
    try {
      const result = await request();
      if (success) toast.success(success);
      await reload();
      return result?.data;
    } catch (err) {
      toast.error(parseApiErrors(err).form);
      return null;
    }
  };

  const isSaved = (slug) => Boolean(data?.saved.some((s) => s.slug === slug));
  const applicationFor = (slug) => data?.applications.find((a) => a.scholarship_slug === slug);
  const enrollmentFor = (slug) => data?.training.find((t) => t.course.slug === slug);

  return {
    isStudent,
    data,
    error,
    reload,
    isSaved,
    applicationFor,
    enrollmentFor,
    enroll: (course) => run(() => portalAPI.enroll(course.slug), 'Enrollment requested: ADRAM will contact you'),
    cancelEnrollment: (id) => run(() => portalAPI.cancelEnrollment(id), 'Enrollment request cancelled'),
    toggleSave: (s) => (isSaved(s.slug) ? run(() => portalAPI.unsave(s.slug), 'Removed from saved') : run(() => portalAPI.save(s.slug), 'Saved to your portal')),
    startApplication: (s) => run(() => portalAPI.startApplication(s.slug), 'Added to My applications'),
    saveGoals: (goals) => run(() => portalAPI.saveGoals(goals), 'Study goals saved'),
    updateApplication: (id, patch) => run(() => portalAPI.updateApplication(id, patch)),
    requestService: (id) => run(() => portalAPI.requestService(id), 'Request sent: ADRAM will review it and email you'),
    acceptTerms: (id) => run(() => portalAPI.acceptTerms(id)),
    // From a scholarship page: start tracking (if needed), then ask ADRAM to apply.
    applyWithAdram: async (s) => {
      const existing = data?.applications.find((a) => a.scholarship_slug === s.slug);
      const application = existing || (await portalAPI.startApplication(s.slug).then(({ data: d }) => d).catch(() => null));
      if (!application) return toast.error('Something went wrong. Please try again.');
      return run(() => portalAPI.requestService(application.id), 'Request sent: ADRAM will apply for you');
    },
    addDocument: (applicationId, name) => run(() => portalAPI.addDocument(applicationId, name)),
    updateDocument: (id, patch) => run(() => portalAPI.updateDocument(id, patch)),
    removeDocument: (id) => run(() => portalAPI.removeDocument(id)),
  };
};

export default usePortal;
