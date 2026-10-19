// The school administrator's app: school overview, every account (add, reset login, remove)
// and the classes.
import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { apiDelete, apiPatch, apiPost, errorText } from '../api';
import {
  Avatar, Bar, Button, Card, Chips, Choice, Empty, ErrorText, Field, Grid2, Loaded, Note, Pill, Row,
  Screen, Sheet, Stat, initials, useData, useKit,
} from '../ui';
import { HeaderButtons } from './Common';

const ROLES = ['learner', 'teacher', 'parent', 'hod', 'principal', 'admin'];
const ROLE_KEY = { learner: 'tab_learner', teacher: 'tab_teacher', parent: 'tab_parent', hod: 'tab_hod', principal: 'tab_principal', admin: 'tab_admin' };

export function AdminOverview() {
  const { t, c, switchTab } = useKit();
  const state = useData('/admin/overview');
  return (
    <Screen title={t('admin_title')} right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Loaded state={state}>
        {(d) => (
          <View>
            <Grid2>
              <Stat n={d.counts.learner || 0} label={t('admin_stat_learners')} />
              <Stat n={(d.counts.teacher || 0) + (d.counts.hod || 0) + (d.counts.principal || 0) + (d.counts.admin || 0)} label={t('admin_stat_staff')} />
            </Grid2>
            <Grid2>
              <Stat n={d.counts.parent || 0} label={t('admin_stat_parents')} />
              <Stat n={d.awaitingFirstLogin} label={t('admin_stat_awaiting')} color={d.awaitingFirstLogin ? c.warn : c.good} />
            </Grid2>
            <Card title={t('admin_title')}>
              {d.subjects.map((s, i) => {
                const low = s.performance != null && s.performance < 70;
                return (
                  <Row key={s.key} first={i === 0} title={t(s.key)}
                    meta={<View>
                      <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>{t('admin_caption', { a: s.attendance ?? '–', p: s.performance ?? '–' })}</Text>
                      <Bar pct={s.performance} color={low ? c.warn : c.good} />
                    </View>}
                    right={<Pill kind={low ? 'warn' : 'good'} text={low ? t('admin_needs_intervention') : t('admin_on_track')} />} />
                );
              })}
            </Card>
            <Button kind="primary" icon="person-add" title={t('nav_add_user')} onPress={() => switchTab('ausers')} />
          </View>
        )}
      </Loaded>
    </Screen>
  );
}

// the login details to pass on, with the phone's share menu (email, WhatsApp, SMS…)
function InviteSheet({ invite, onClose }) {
  if (!invite) return null;
  return <InviteDetails key={invite.userId + invite.tempPassword} invite={invite} onClose={onClose} />;
}

// "Send email" has the server email the login details straight away; "Share" uses the
// phone's share menu (WhatsApp, SMS…)
function InviteDetails({ invite, onClose }) {
  const { t, has, token, c } = useKit();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { kind: 'sent' | 'logged' | 'error', text }
  const text = `Smart Learning\n${invite.name}\n${t('login_email_label')}: ${invite.email}\n${t('m_temp_password')}: ${invite.tempPassword}\n${invite.loginUrl}`;

  async function sendEmail() {
    setSending(true);
    setResult(null);
    const { data, error } = await apiPost(`/admin/users/${invite.userId}/email-login`, { tempPassword: invite.tempPassword }, token);
    setSending(false);
    if (error) return setResult({ kind: 'error', text: errorText(t, has, error) });
    setResult(data.sent ? { kind: 'sent', text: t('admin_invite_sent', { email: data.email }) } : { kind: 'logged', text: t('admin_invite_logged') });
  }

  const sent = result && result.kind === 'sent';
  return (
    <Sheet visible title={t('admin_invite_title', { name: invite.name })} onClose={onClose}>
      <View style={{ padding: 16 }}>
        <Card>
          <Row first title={t('login_email_label')} meta={invite.email} />
          <Row title={t('m_temp_password')} meta={<Text selectable style={{ color: c.ink, fontSize: 20, fontWeight: '800', letterSpacing: 1, marginTop: 4 }}>{invite.tempPassword}</Text>} />
        </Card>
        {result ? (
          result.kind === 'error' ? <ErrorText>{result.text}</ErrorText> : <Note kind={sent ? 'good' : 'brand'}>{result.text}</Note>
        ) : <Note>{t('m_temp_password_note')}</Note>}
        <Button kind="primary" icon={sent ? 'checkmark-circle' : 'mail'} busy={sending} disabled={sent}
          title={sent ? t('admin_invite_sent_btn') : t('admin_invite_send_btn')} onPress={sendEmail} style={{ marginTop: 6 }} />
        <Button icon="share-outline" title={t('m_share')} onPress={() => Share.share({ message: text })} style={{ marginTop: 10 }} />
        <Button title={t('admin_invite_close')} onPress={onClose} style={{ marginTop: 10 }} />
      </View>
    </Sheet>
  );
}

function AddUserSheet({ visible, onClose, onAdded }) {
  const { t, has, token } = useKit();
  const catalog = useData('/catalog');
  const learners = useData('/admin/users?role=learner');
  const [role, setRole] = useState('learner');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [grade, setGrade] = useState('10');
  const [group, setGroup] = useState(null);
  const [subjectKey, setSubjectKey] = useState(null);
  const [dept, setDept] = useState(null);
  const [childId, setChildId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return setError(t('admin_error_name'));
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t('admin_error_email'));
    const body = { role, name: name.trim(), email: email.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) };
    if (role === 'learner') body.grade = grade;
    if (role === 'teacher') { if (!subjectKey) return setError(t('signup_subject_label')); body.subjectKey = subjectKey; }
    if (role === 'hod') { if (!dept) return setError(t('hod_dept_select_label')); body.dept = dept; }
    if (role === 'parent' && childId) body.childId = childId;
    setError(null);
    setBusy(true);
    const { data, error: err } = await apiPost('/admin/users', body, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    setName(''); setEmail(''); setPhone('');
    onAdded(data.invite);
  }

  const groups = catalog.data ? catalog.data.subjectGroups : [];
  const shownGroup = groups.find((g) => g.id === group) || groups[0];
  return (
    <Sheet visible={visible} title={t('admin_add_title')} sub={t('m_add_user_sub')} onClose={onClose}>
      <View style={{ padding: 16 }}>
        <Choice label={t('admin_role_label')} value={role} onChange={setRole} options={ROLES.map((r) => ({ id: r, label: t(ROLE_KEY[r]) }))} />
        <Field label={t('signup_name_label')} value={name} onChangeText={setName} placeholder={t('admin_user_name_placeholder')} maxLength={100} />
        <Field label={t('signup_email_label')} value={email} onChangeText={setEmail} placeholder={t('admin_user_email_placeholder')} autoCapitalize="none" keyboardType="email-address" />
        <Field label={t('profile_phone_label')} value={phone} onChangeText={setPhone} placeholder={t('profile_phone_placeholder')} keyboardType="phone-pad" maxLength={30} hint={t('m_phone_hint')} />
        {role === 'learner' ? <Choice label={t('login_grade_label')} value={grade} onChange={setGrade} options={['10', '11', '12'].map((g) => ({ id: g, label: t('grade_' + g) }))} /> : null}
        {role === 'teacher' && shownGroup ? (
          <View>
            <Chips value={shownGroup.id} onChange={setGroup} items={groups.map((g) => ({ id: g.id, label: t(g.labelKey) }))} />
            <Choice label={t('signup_subject_label')} value={subjectKey} onChange={setSubjectKey} options={shownGroup.subjects.map((s) => ({ id: s, label: t(s) }))} />
          </View>
        ) : null}
        {role === 'hod' && catalog.data ? (
          <Choice label={t('hod_dept_select_label')} value={dept} onChange={setDept} options={catalog.data.departments.map((d) => ({ id: d.id, label: t(d.labelKey) }))} />
        ) : null}
        {role === 'parent' && learners.data ? (
          <Choice label={t('admin_child_link_label')} value={childId} onChange={(id) => setChildId(id === childId ? null : id)}
            options={learners.data.users.map((u) => ({ id: u.id, label: u.name }))} />
        ) : null}
        <ErrorText>{error}</ErrorText>
        <Button kind="primary" title={t('admin_add_user_btn')} onPress={add} busy={busy} />
      </View>
    </Sheet>
  );
}

// the admin sets or changes someone's phone number (used for SMS)
function PhoneSheet({ user, onClose, onSaved }) {
  if (!user) return null;
  return <PhoneForm key={user.id} user={user} onClose={onClose} onSaved={onSaved} />;
}

function PhoneForm({ user, onClose, onSaved }) {
  const { t, has, token, showToast } = useKit();
  const [phone, setPhone] = useState(user.phone || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error: err } = await apiPatch(`/admin/users/${user.id}`, { phone: phone.trim() }, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    showToast(t('m_phone_saved'));
    onSaved();
  }
  return (
    <Sheet visible title={t('m_phone_title', { name: user.name })} onClose={onClose}>
      <View style={{ padding: 16 }}>
        <Field label={t('profile_phone_label')} value={phone} onChangeText={setPhone} placeholder={t('profile_phone_placeholder')}
          keyboardType="phone-pad" maxLength={30} hint={t('m_phone_hint')} autoFocus />
        <ErrorText>{error}</ErrorText>
        <Button kind="primary" title={t('profile_save_btn')} onPress={save} busy={busy} />
      </View>
    </Sheet>
  );
}

export function AdminUsers() {
  const { t, has, token, c, showToast } = useKit();
  const [role, setRole] = useState('all');
  const [q, setQ] = useState('');
  const state = useData(`/admin/users?role=${role}${q.trim() ? '&q=' + encodeURIComponent(q.trim()) : ''}`);
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [phoneFor, setPhoneFor] = useState(null);

  async function resetLogin(u) {
    const { data, error } = await apiPost(`/admin/users/${u.id}/reset-login`, {}, token);
    if (error) return showToast(errorText(t, has, error));
    setInvite(data.invite);
    state.reload();
  }
  async function remove(u) {
    setConfirmRemove(null);
    const { error } = await apiDelete(`/admin/users/${u.id}`, token);
    if (error) return showToast(errorText(t, has, error));
    state.reload();
  }

  return (
    <Screen title={t('admin_users_title')} sub={state.data ? t('admin_users_count', { n: state.data.users.length, total: state.data.total }) : null}
      right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Button kind="primary" icon="person-add" title={t('nav_add_user')} onPress={() => setAdding(true)} style={{ marginBottom: 12 }} />
      <Field value={q} onChangeText={setQ} placeholder={t('admin_search_placeholder')} autoCapitalize="none" />
      <Chips value={role} onChange={setRole} items={[{ id: 'all', label: t('admin_filter_all') }, ...ROLES.map((r) => ({ id: r, label: t(ROLE_KEY[r]) }))]} />
      <Card>
        <Loaded state={state}>
          {(data) => data.users.length === 0 ? <Empty text={t('admin_users_empty')} /> : data.users.map((u, i) => (
            <Row key={u.id} first={i === 0} left={<Avatar text={initials(u.name)} color={c.brand} size={38} />}
              title={u.name}
              meta={<View style={{ marginTop: 2, gap: 4 }}>
                <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>{t(ROLE_KEY[u.role])}{u.grade ? ' · ' + t('grade_' + u.grade) : ''} · {u.email}{u.phone ? ' · ' + u.phone : ''}</Text>
                {u.mustChangePassword ? <Pill kind="warn" text={t('admin_awaiting_login_pill')} /> : null}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Button small title={t('admin_resend_btn')} onPress={() => resetLogin(u)} />
                  <Button small icon="call-outline" title={t('m_phone_btn')} onPress={() => setPhoneFor(u)} />
                  <Button small kind="danger" title={t('admin_remove_user_btn')} onPress={() => setConfirmRemove(u)} />
                </View>
              </View>} />
          ))}
        </Loaded>
      </Card>
      <Text style={{ color: c.inkSoft, fontSize: 12, textAlign: 'center' }}>{t('admin_add_user_hint')}</Text>

      <AddUserSheet visible={adding} onClose={() => setAdding(false)} onAdded={(inv) => { setAdding(false); setInvite(inv); state.reload(); }} />
      <InviteSheet invite={invite} onClose={() => setInvite(null)} />
      <PhoneSheet user={phoneFor} onClose={() => setPhoneFor(null)} onSaved={() => { setPhoneFor(null); state.reload(); }} />
      <Sheet visible={Boolean(confirmRemove)} title={t('admin_remove_user_btn')} onClose={() => setConfirmRemove(null)}>
        {confirmRemove ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: c.ink, fontSize: 15, marginBottom: 14 }}>{t('admin_remove_confirm', { name: confirmRemove.name })}</Text>
            <Button kind="danger" title={t('admin_remove_user_btn')} onPress={() => remove(confirmRemove)} />
            <Button title={t('pw_cancel_btn')} onPress={() => setConfirmRemove(null)} style={{ marginTop: 10 }} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

export function AdminClasses() {
  const { t, c } = useKit();
  const state = useData('/admin/classes');
  return (
    <Screen title={t('admin_class_list_title')} sub={state.data ? t('admin_class_count', { n: state.data.classes.length }) : null}
      right={<HeaderButtons />} onRefresh={state.reload} refreshing={state.loading}>
      <Card>
        <Loaded state={state}>
          {(data) => data.classes.length === 0 ? <Empty text={t('admin_classes_empty')} /> : data.classes.map((k, i) => (
            <Row key={k.id} first={i === 0} left={<Avatar text={k.name} color={c.brand} size={40} />}
              title={`${t(k.subjectKey)} · ${t('grade_' + k.grade)}`}
              meta={<Text style={{ color: k.teacherName ? c.inkSoft : c.bad, fontSize: 12.5, marginTop: 2 }}>
                {(k.teacherName || t('admin_class_no_teacher')) + ' · ' + t('m_learners_n', { n: k.learnerIds.length })}
              </Text>} />
          ))}
        </Loaded>
      </Card>
      <Note>{t('m_classes_on_web')}</Note>
    </Screen>
  );
}


// ---- text messages (textbee) ----

const SMS_MAX = 480;

export function AdminSms() {
  const { t, has, token, c, showToast } = useKit();
  const status = useData('/admin/sms');
  const people = useData('/admin/users');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const withPhone = people.data ? people.data.users.filter((u) => u.phone) : [];
  // adds a saved number to the "To" box (once)
  const addNumber = (n) => setTo((cur) => {
    const list = cur.split(',').map((x) => x.trim()).filter(Boolean);
    return list.includes(n) ? cur : [...list, n].join(', ');
  });

  async function send() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await apiPost('/admin/sms', { to, message: message.trim() }, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    showToast(data.configured ? t('m_sms_sent', { n: data.sent }) : t('m_sms_logged'));
    setMessage('');
  }

  return (
    <Screen title={t('m_sms_title')} right={<HeaderButtons />} onRefresh={() => { status.reload(); people.reload(); }} refreshing={status.loading}>
      {status.data ? (
        <Note kind={status.data.configured ? 'good' : 'brand'}>{status.data.configured ? t('m_sms_ready') : t('m_sms_not_set_up')}</Note>
      ) : null}
      <Card>
        <Field label={t('m_sms_to')} value={to} onChangeText={setTo} placeholder="082 123 4567, 073 555 0101" keyboardType="phone-pad" />
        {withPhone.length ? (
          <View style={{ marginTop: -4, marginBottom: 4 }}>
            <Text style={{ color: c.inkSoft, fontWeight: '600', fontSize: 13, marginBottom: 6 }}>{t('m_sms_pick')}</Text>
            <Chips value={null} onChange={addNumber} items={withPhone.map((u) => ({ id: u.phone, label: u.name }))} />
          </View>
        ) : null}
        <Field label={t('m_sms_message')} value={message} onChangeText={setMessage} multiline maxLength={SMS_MAX}
          hint={`${message.length}/${SMS_MAX}`} />
        <ErrorText>{error}</ErrorText>
        <Button kind="primary" icon="send" title={t('m_sms_send')} onPress={send} busy={busy} disabled={!to.trim() || !message.trim()} />
      </Card>
      <Text style={{ color: c.inkSoft, fontSize: 12.5, lineHeight: 18, textAlign: 'center' }}>{t('m_sms_auto')}</Text>
    </Screen>
  );
}
