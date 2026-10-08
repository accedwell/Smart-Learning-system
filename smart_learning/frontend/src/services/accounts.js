// Account helpers. Accounts live in the in-memory store (state.admin.users) until
// the backend exists; passwords are kept as plain text only because this is a
// prototype. The backend must hash them and send the invite emails itself.

// only these roles may create their own account; everyone else is added by the school administrator
export const SELF_SIGNUP_ROLES = ['learner','admin'];
export const ADMIN_CREATED_ROLES = ['teacher','parent','hod','principal'];

export const MIN_PASSWORD_LENGTH = 8;

export function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function findAccount(users, email){
  const key = (email||'').trim().toLowerCase();
  return key ? users.find(u=>u.email && u.email.toLowerCase()===key) : undefined;
}

// readable temporary password (no 0/O, 1/l/I look-alikes)
export function generateTempPassword(length=10){
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, v=>chars[v % chars.length]).join('');
}

// the email an administrator sends a new user with their login details
export function buildInviteEmail(invite, t){
  const subject = t('invite_subject');
  const body = t('invite_body', {
    name: invite.name,
    role: t('tab_'+invite.role),
    url: window.location.origin,
    email: invite.email,
    password: invite.tempPassword,
  });
  const mailto = 'mailto:'+encodeURIComponent(invite.email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  return { subject, body, mailto };
}
