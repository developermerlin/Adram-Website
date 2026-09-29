import { useState } from 'react';
import toast from 'react-hot-toast';
import { adminAPI, parseApiErrors } from '../../services/api';
import { ROLES } from '../../config/roles';
import { ACTION_META, CONFIRM } from '../../utils/userStatus';
import ConfirmDialog from './ConfirmDialog';

/**
 * Runs an admin action on one user, asking for confirmation where needed.
 * Returns [run(user, action, extra), dialog element]. `onDone(updatedUser)` refreshes the caller.
 */
export const useUserAction = (onDone) => {
  const [pending, setPending] = useState(null); // { user, action } awaiting confirmation

  const execute = async (user, action, extra = {}) => {
    try {
      const { data } = await adminAPI.userAction(user.id, action, extra);
      const verb = action === 'set_role' ? `now ${ROLES[extra.role]}` : ACTION_META[action].done;
      toast.success(`${user.full_name} ${action === 'set_role' ? 'is' : 'was'} ${verb}.`);
      onDone?.(data.user);
    } catch (err) {
      toast.error(parseApiErrors(err, 'That action didn’t work. Please try again.').form);
    }
  };

  const run = (user, action, extra) => (CONFIRM[action] ? setPending({ user, action }) : execute(user, action, extra));

  const dialog = pending && (
    <ConfirmDialog
      config={CONFIRM[pending.action]}
      onClose={() => setPending(null)}
      onConfirm={async (reason) => {
        await execute(pending.user, pending.action, reason ? { reason } : {});
        setPending(null);
      }}
    />
  );
  return [run, dialog];
};

export default useUserAction;
