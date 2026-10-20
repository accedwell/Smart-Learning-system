// The school administrator's app: school overview, every account (add, reset login, remove)
// and the classes.
import { useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { apiDelete, apiPost, apiPut, errorText } from '../api';
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

// the login details to pass on, with the phone's share menu (email, WhatsApp…)
function InviteSheet({ invite, onClose }) {
  if (!invite) return null;
  return <InviteDetails key={invite.userId + invite.tempPassword} invite={invite} onClose={onClose} />;
}

// "Send email" has the server email the login details straight away; "Share" uses the
// phone's share menu (WhatsApp, email…)
// A learner (added with their ID number) has no email: their login goes to their parent, with the
// parent's own when the parent's account is new too (invite.parent.tempPassword).
function InviteDetails({ invite, onClose }) {
  const { t, has, token, c } = useKit();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { kind: 'sent' | 'logged' | 'error', text }
  const family = Boolean(invite.idNumber);
  const parent = invite.parent;
  const big = (value) => <Text selectable style={{ color: c.ink, fontSize: 20, fontWeight: '800', letterSpacing: 1, marginTop: 4 }}>{value}</Text>;
  const text = family
    ? [`Smart Learning – ${invite.name}`, `${t('login_id_label')}: ${invite.idNumber}`, `${t('m_temp_password')}: ${invite.tempPassword}`,
      ...(parent && parent.tempPassword ? ['', `${parent.name}`, `${t('login_email_label')}: ${parent.email}`, `${t('m_temp_password')}: ${parent.tempPassword}`] : []),
      invite.loginUrl].join('\n')
    : `Smart Learning\n${invite.name}\n${t('login_email_label')}: ${invite.email}\n${t('m_temp_password')}: ${invite.tempPassword}\n${invite.loginUrl}`;

  async function sendEmail() {
    setSending(true);
    setResult(null);
    const body = { tempPassword: invite.tempPassword,
      ...(parent ? { parentId: parent.userId, ...(parent.tempPassword ? { parentTempPassword: parent.tempPassword } : {}) } : {}) };
    const { data, error } = await apiPost(`/admin/users/${invite.userId}/email-login`, body, token);
    setSending(false);
    if (error) return setResult({ kind: 'error', text: errorText(t, has, error) });
    setResult(data.sent ? { kind: 'sent', text: t('admin_invite_sent', { email: data.email }) } : { kind: 'logged', text: t('admin_invite_logged') });
  }

  const sent = result && result.kind === 'sent';
  return (
    <Sheet visible title={family ? t('admin_invite_family_title', { name: invite.name }) : t('admin_invite_title', { name: invite.name })} onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {family ? (
          <>
            <Card title={t('admin_invite_learner_login', { name: invite.name })}>
              <Row first title={t('login_id_label')} meta={big(invite.idNumber)} />
              <Row title={t('m_temp_password')} meta={big(invite.tempPassword)} />
            </Card>
            {parent && parent.tempPassword ? (
              <Card title={t('admin_invite_parent_login')} aside={parent.name}>
                <Row first title={t('login_email_label')} meta={parent.email} />
                <Row title={t('m_temp_password')} meta={big(parent.tempPassword)} />
              </Card>
            ) : null}
            {parent ? <Note>{t('admin_invite_sent_to_parent', { email: parent.email })}{parent.tempPassword ? '' : ' ' + t('admin_invite_parent_keeps')}</Note>
              : <ErrorText>{t('admin_error_no_parent_email')}</ErrorText>}
          </>
        ) : (
          <Card>
            <Row first title={t('login_email_label')} meta={invite.email} />
            <Row title={t('m_temp_password')} meta={big(invite.tempPassword)} />
          </Card>
        )}
        {result ? (
          result.kind === 'error' ? <ErrorText>{result.text}</ErrorText> : <Note kind={sent ? 'good' : 'brand'}>{result.text}</Note>
        ) : family ? null : <Note>{t('m_temp_password_note')}</Note>}
        <Button kind="primary" icon={sent ? 'checkmark-circle' : 'mail'} busy={sending} disabled={sent || (family && !parent)}
          title={sent ? t('admin_invite_sent_btn') : t('admin_invite_send_btn')} onPress={sendEmail} style={{ marginTop: 6 }} />
        <Button icon="share-outline" title={t('m_share')} onPress={() => Share.share({ message: text })} style={{ marginTop: 10 }} />
        <Button title={t('admin_invite_close')} onPress={onClose} style={{ marginTop: 10 }} />
      </ScrollView>
    </Sheet>
  );
}

const isEmail = (v) => /^\S+@\S+\.\S+$/.test(v.trim());
const SUBJECT_COUNT = 7;

// a learner's 7 subjects, as tick-boxes grouped like the catalog (Languages, Mathematics, ...)
function SubjectPicker({ groups, value, onChange }) {
  const { t, c } = useKit();
  const full = value.length >= SUBJECT_COUNT;
  const toggle = (s) => onChange(value.includes(s) ? value.filter((x) => x !== s) : full ? value : [...value, s]);
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ color: c.inkSoft, fontWeight: '600', fontSize: 13 }}>{t('admin_subjects_label')}</Text>
        <Pill kind={value.length === SUBJECT_COUNT ? 'good' : 'warn'} text={t('admin_subjects_count', { n: value.length })} />
      </View>
      <Text style={{ color: c.inkSoft, fontSize: 12, marginBottom: 8 }}>{t('admin_subjects_hint')}</Text>
      {groups.map((g) => (
        <View key={g.id} style={{ marginBottom: 8 }}>
          <Text style={{ color: c.ink, fontWeight: '700', fontSize: 12.5, marginBottom: 4 }}>{t(g.labelKey)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {g.subjects.map((s) => {
              const on = value.includes(s);
              return (
                <Text key={s} onPress={() => toggle(s)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  style={{ borderWidth: 1, borderColor: on ? c.brand : c.border, backgroundColor: on ? c.brand : c.surface, color: on ? c.onBrand : c.ink,
                    opacity: on || !full ? 1 : 0.45, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 6, fontSize: 12.5, overflow: 'hidden' }}>
                  {t(s)}
                </Text>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function SubjectsSheet({ user, onClose, onSaved }) {
  const { t, has, token } = useKit();
  const catalog = useData('/catalog');
  const [subjects, setSubjectsState] = useState(user.subjects && user.subjects.length ? user.subjects : ['subject_lo']);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error: err } = await apiPut(`/admin/users/${user.id}/subjects`, { subjects }, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    onSaved();
  }
  return (
    <Sheet visible title={t('admin_subjects_title', { name: user.name })} onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {catalog.data ? <SubjectPicker groups={catalog.data.subjectGroups} value={subjects} onChange={(v) => { setSubjectsState(v); setError(null); }} /> : null}
        <ErrorText>{error}</ErrorText>
        <Button kind="primary" title={t('profile_save_btn')} onPress={save} busy={busy} disabled={subjects.length !== SUBJECT_COUNT} />
      </ScrollView>
    </Sheet>
  );
}

// A learner is added with their ID number (no email) and linked to a parent: a new one, added
// with them, or one already in the system.
function AddUserSheet({ visible, onClose, onAdded }) {
  const { t, has, token } = useKit();
  const catalog = useData('/catalog');
  const learners = useData('/admin/users?role=learner');
  const parents = useData('/admin/users?role=parent');
  const [role, setRole] = useState('learner');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [parentMode, setParentMode] = useState('new');
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentId, setParentId] = useState(null);
  const [subjects, setSubjects] = useState(['subject_lo']);
  const [grade, setGrade] = useState('10');
  const [group, setGroup] = useState(null);
  const [subjectKey, setSubjectKey] = useState(null);
  const [dept, setDept] = useState(null);
  const [childId, setChildId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const learner = role === 'learner';

  async function add() {
    if (!name.trim()) return setError(t('admin_error_name'));
    const body = { role, name: name.trim() };
    if (learner) {
      if (!/^\d{13}$/.test(idNumber.replace(/[\s-]/g, ''))) return setError(t('admin_error_id_number'));
      if (subjects.length !== SUBJECT_COUNT) return setError(t('admin_error_subject_count'));
      Object.assign(body, { idNumber: idNumber.trim(), grade, subjects });
      if (parentMode === 'new') {
        if (!parentName.trim()) return setError(t('admin_error_name'));
        if (!isEmail(parentEmail)) return setError(t('admin_error_email'));
        body.parent = { name: parentName.trim(), email: parentEmail.trim() };
      } else {
        if (!parentId) return setError(t('admin_error_parent_required'));
        body.parentId = parentId;
      }
    } else {
      if (!isEmail(email)) return setError(t('admin_error_email'));
      body.email = email.trim();
    }
    if (role === 'teacher') { if (!subjectKey) return setError(t('signup_subject_label')); body.subjectKey = subjectKey; }
    if (role === 'hod') { if (!dept) return setError(t('hod_dept_select_label')); body.dept = dept; }
    if (role === 'parent' && childId) body.childId = childId;
    setError(null);
    setBusy(true);
    const { data, error: err } = await apiPost('/admin/users', body, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    setName(''); setEmail(''); setIdNumber(''); setParentName(''); setParentEmail(''); setSubjects(['subject_lo']);
    if (data.parent) parents.reload();
    onAdded(data.invite);
  }

  const groups = catalog.data ? catalog.data.subjectGroups : [];
  const shownGroup = groups.find((g) => g.id === group) || groups[0];
  return (
    <Sheet visible={visible} title={t('admin_add_title')} sub={t('m_add_user_sub')} onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Choice label={t('admin_role_label')} value={role} onChange={setRole} options={ROLES.map((r) => ({ id: r, label: t(ROLE_KEY[r]) }))} />
        <Field label={t('signup_name_label')} value={name} onChangeText={setName} placeholder={t('admin_user_name_placeholder')} maxLength={100} />
        {learner ? (
          <Field label={t('login_id_label')} value={idNumber} onChangeText={setIdNumber} placeholder={t('login_id_placeholder')}
            keyboardType="number-pad" maxLength={17} hint={t('admin_learner_id_hint')} />
        ) : (
          <Field label={t('signup_email_label')} value={email} onChangeText={setEmail} placeholder={t('admin_user_email_placeholder')} autoCapitalize="none" keyboardType="email-address" />
        )}
        {learner ? <Choice label={t('login_grade_label')} value={grade} onChange={setGrade} options={['10', '11', '12'].map((g) => ({ id: g, label: t('grade_' + g) }))} /> : null}
        {learner && catalog.data ? <SubjectPicker groups={catalog.data.subjectGroups} value={subjects} onChange={setSubjects} /> : null}
        {learner ? (
          <Card title={t('admin_learner_parent_title')}>
            <Choice value={parentMode} onChange={setParentMode} options={[{ id: 'new', label: t('admin_parent_new') }, { id: 'existing', label: t('admin_parent_existing') }]} />
            {parentMode === 'new' ? (
              <>
                <Field label={t('admin_parent_name_label')} value={parentName} onChangeText={setParentName} placeholder={t('admin_user_name_placeholder')} maxLength={100} />
                <Field label={t('admin_parent_email_label')} value={parentEmail} onChangeText={setParentEmail} placeholder={t('admin_user_email_placeholder')} autoCapitalize="none" keyboardType="email-address" />
              </>
            ) : parents.data ? (
              parents.data.users.length ? (
                <Choice label={t('admin_parent_pick_label')} value={parentId} onChange={setParentId}
                  options={parents.data.users.map((p) => ({ id: p.id, label: p.name }))} />
              ) : <Text style={{ color: '#888' }}>{t('admin_parent_none')}</Text>
            ) : null}
          </Card>
        ) : null}
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
      </ScrollView>
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
  const [subjectsFor, setSubjectsFor] = useState(null);

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
                <Text style={{ color: c.inkSoft, fontSize: 12.5 }}>{t(ROLE_KEY[u.role])}{u.grade ? ' · ' + t('grade_' + u.grade) : ''} · {u.email || (u.idNumber ? t('login_id_label') + ' ' + u.idNumber : '—')}</Text>
                {u.role === 'learner' ? (
                  <Text style={{ color: c.inkSoft, fontSize: 12 }}>
                    {t('profile_subjects_label')}: {(u.subjects || []).length ? u.subjects.map((s) => t(s)).join(', ') : t('admin_subjects_none')}
                  </Text>
                ) : null}
                {u.mustChangePassword ? <Pill kind="warn" text={t('admin_awaiting_login_pill')} /> : null}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {u.role === 'learner' ? <Button small title={t('admin_subjects_btn')} onPress={() => setSubjectsFor(u)} /> : null}
                  <Button small title={t('admin_resend_btn')} onPress={() => resetLogin(u)} />
                  <Button small kind="danger" title={t('admin_remove_user_btn')} onPress={() => setConfirmRemove(u)} />
                </View>
              </View>} />
          ))}
        </Loaded>
      </Card>
      <Text style={{ color: c.inkSoft, fontSize: 12, textAlign: 'center' }}>{t('admin_add_user_hint')}</Text>

      <AddUserSheet visible={adding} onClose={() => setAdding(false)} onAdded={(inv) => { setAdding(false); setInvite(inv); state.reload(); }} />
      <InviteSheet invite={invite} onClose={() => setInvite(null)} />
      {subjectsFor ? <SubjectsSheet user={subjectsFor} onClose={() => setSubjectsFor(null)}
        onSaved={() => { setSubjectsFor(null); showToast(t('admin_subjects_saved')); state.reload(); }} /> : null}
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


