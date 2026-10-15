// Screens every role shares: the language / notification buttons, notifications, the chat
// assistant, opening a question paper, and My Profile.
import { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { API_URL, apiGet, apiPatch, apiPost, errorText } from '../api';
import { LANGUAGES } from '../i18n';
import {
  Avatar, Button, Card, ErrorText, Field, Icon, IconButton, Loaded, Row, Screen, Sheet,
  formatTime, initials, useData, useKit,
} from '../ui';
import { LanguageSheet, NewPasswordForm } from './Auth';

// ---- header buttons: language and notifications ----

export function HeaderButtons() {
  const { t, lang, setLanguage, token } = useKit();
  const [langOpen, setLangOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    apiGet('/notifications', token).then(({ data }) => { if (alive && data) setUnread(data.unread); });
    return () => { alive = false; };
  }, [token, notesOpen]);

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <IconButton name="globe-outline" label={t('lang_label')} onPress={() => setLangOpen(true)} />
      <IconButton name="notifications-outline" label={t('parent_notifications_title')} dot={unread > 0} onPress={() => setNotesOpen(true)} />
      <LanguageSheet visible={langOpen} lang={lang} onClose={() => setLangOpen(false)} onPick={(v) => { setLanguage(v); setLangOpen(false); }} />
      <Sheet visible={notesOpen} title={t('parent_notifications_title')} onClose={() => setNotesOpen(false)}>
        {notesOpen ? <NotificationList /> : null}
      </Sheet>
    </View>
  );
}

export function NotificationList({ inPage }) {
  const { t, has, token, c } = useKit();
  const state = useData('/notifications');
  const [error, setError] = useState(null);

  async function readAll() {
    const { error: err } = await apiPost('/notifications/read-all', {}, token);
    if (err) setError(errorText(t, has, err));
    else state.reload();
  }

  const body = (
    <Loaded state={state}>
      {(data) => (
        <View>
          <Card>
            {data.notifications.length === 0 ? <Text style={{ color: c.inkSoft, textAlign: 'center', padding: 10 }}>{t('parent_notifications_empty')}</Text> : null}
            {data.notifications.map((n, i) => (
              <Row key={n.id} first={i === 0}
                left={<Avatar icon="notifications" color={c.brand} size={36} />}
                meta={formatTime(n.createdAt)}>
                <Text style={{ color: c.ink, fontWeight: n.read ? '400' : '700', fontSize: 14, lineHeight: 20 }}>
                  {n.key ? t(n.key, n.params || {}) : n.message}
                </Text>
              </Row>
            ))}
          </Card>
          <ErrorText>{error}</ErrorText>
          {data.unread > 0 ? <Button title={t('parent_mark_read')} onPress={readAll} /> : null}
        </View>
      )}
    </Loaded>
  );
  if (inPage) return body;
  return <ScrollView contentContainerStyle={{ padding: 16 }}>{body}</ScrollView>;
}

export function NotificationsScreen() {
  const { t } = useKit();
  return (
    <Screen title={t('parent_notifications_title')}>
      <NotificationList inPage />
    </Screen>
  );
}

// ---- question papers ----

// Downloads the paper with the login token, then opens the phone's viewer (PDF, Word or photo).
export async function openPaper(paper, token) {
  const url = API_URL.replace(/\/api$/, '') + paper.fileUrl;
  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error('download failed');
    window.open(URL.createObjectURL(await res.blob()), '_blank');
    return;
  }
  const safeName = paper.id + '-' + (paper.fileName || 'paper').replace(/[^\w.-]+/g, '_');
  const file = new File(Paths.cache, safeName);
  if (file.exists) file.delete();
  const saved = await File.downloadFileAsync(url, file, { headers: { Authorization: 'Bearer ' + token } });
  await Sharing.shareAsync(saved.uri, { mimeType: paper.mimeType, dialogTitle: paper.title });
}

// ---- chat assistant ----

export function ChatSheet({ visible, onClose }) {
  const { t, has, token, lang, c } = useKit();
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', content, failed? }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef(null);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput('');
    // the backend wants turns that alternate user/assistant, starting and ending with the user:
    // failed replies are left out, and of two turns in a row by the same side the later one counts
    const turns = [];
    for (const m of [...messages.filter((x) => !x.failed), { role: 'user', content }]) {
      const turn = { role: m.role, content: m.content };
      if (turns.length && turns[turns.length - 1].role === turn.role) turns[turns.length - 1] = turn;
      else turns.push(turn);
    }
    while (turns.length > 12 || turns[0].role !== 'user') turns.shift();
    setMessages((m) => [...m, { role: 'user', content }]);
    setSending(true);
    const { data, error } = await apiPost('/ai/chat', { messages: turns, lang: lang === 'English' ? undefined : lang }, token);
    setSending(false);
    setMessages((m) => [...m, error
      ? { role: 'assistant', content: errorText(t, has, error) || t('chat_error'), failed: true }
      : { role: 'assistant', content: data.reply }]);
  }

  useEffect(() => { setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50); }, [messages, sending]);

  const suggestions = ['teach me how to count', 'what is 12 x 7', 'explain tenses', 'solve 3x + 2 = 11'];
  return (
    <Sheet visible={visible} title={t('chat_title')} sub={t('chat_sub')} onClose={onClose}>
      <View style={{ height: 520 }}>
        <FlatList
          ref={list}
          data={[...messages, ...(sending ? [{ role: 'assistant', content: t('chat_thinking'), pending: true }] : [])]}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 14, gap: 8 }}
          ListEmptyComponent={<Text style={{ color: c.inkSoft, textAlign: 'center', padding: 12, lineHeight: 20 }}>{t('chat_welcome')}</Text>}
          renderItem={({ item }) => (
            <View style={{
              alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%',
              backgroundColor: item.role === 'user' ? c.brand : c.chip, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9,
              opacity: item.pending ? 0.6 : 1,
            }}>
              <Text style={{ color: item.role === 'user' ? '#fff' : item.failed ? c.bad : c.ink, fontSize: 14, lineHeight: 20 }}>{item.content}</Text>
            </View>
          )}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingBottom: 8 }}>
          {suggestions.map((s) => (
            <Pressable key={s} onPress={() => send(s)} style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: c.ink, fontSize: 13 }}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface }}>
          <TextInput value={input} onChangeText={setInput} placeholder={t('chat_placeholder')} placeholderTextColor={c.inkSoft}
            onSubmitEditing={() => send()} returnKeyType="send" maxLength={4000}
            style={{ flex: 1, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, color: c.ink, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, fontSize: 15 }} />
          <Pressable onPress={() => send()} disabled={sending || !input.trim()} accessibilityLabel={t('chat_send')}
            style={{ backgroundColor: c.brand, borderRadius: 14, width: 48, alignItems: 'center', justifyContent: 'center', opacity: sending || !input.trim() ? 0.5 : 1 }}>
            <Icon name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

// ---- My Profile ----

const ROLE_KEY = { learner: 'tab_learner', teacher: 'tab_teacher', parent: 'tab_parent', hod: 'tab_hod', principal: 'tab_principal', admin: 'tab_admin' };

export function ProfileScreen({ extra }) {
  const { t, has, token, user, updateUser, replaceToken, showToast, lang, setLanguage, c } = useKit();
  const me = useData('/auth/me');
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const emailChanged = email.trim().toLowerCase() !== user.email;

  async function save() {
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), phone: phone.trim(), email: email.trim(), ...(emailChanged ? { currentPassword } : {}) };
    const { data, error: err } = await apiPatch('/auth/me', body, token);
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    updateUser(data.user);
    setCurrentPassword('');
    showToast(t('profile_saved_note'));
  }

  async function changePassword(newPassword, current) {
    const { data, error: err } = await apiPost('/auth/change-password', { currentPassword: current, newPassword }, token);
    if (err) return errorText(t, has, err);
    replaceToken(data.token); // a new password signs out other devices, so this one gets a new token
    showToast(t('pw_changed_note'));
    return null;
  }

  const p = me.data ? me.data.user : user;
  return (
    <Screen title={t('profile_button')} onRefresh={me.reload} refreshing={me.loading}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar text={initials(user.name)} color={c.brand} size={58} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.ink, fontSize: 20, fontWeight: '800' }}>{user.name}</Text>
          <Text style={{ color: c.inkSoft, marginTop: 2 }}>{t(ROLE_KEY[user.role])}{p.grade ? ' · ' + t('grade_' + p.grade) : ''}</Text>
        </View>
      </Card>

      {extra}

      <Card title={t('profile_details_title')}>
        <Field label={t('signup_name_label')} value={name} onChangeText={setName} maxLength={100} />
        <Field label={t('signup_email_label')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        {emailChanged ? (
          <Field label={t('pw_current_label')} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry hint={t('profile_email_password_hint')} />
        ) : null}
        <Field label={t('profile_phone_label')} value={phone} onChangeText={setPhone} placeholder={t('profile_phone_placeholder')} keyboardType="phone-pad" maxLength={30} />
        <ErrorText>{error}</ErrorText>
        <Button kind="primary" title={t('profile_save_btn')} onPress={save} busy={busy} disabled={!name.trim()} />
      </Card>

      <Card title={t('profile_school_title')}>
        <Row first title={t('admin_role_label')} right={<Text style={{ color: c.ink, fontWeight: '600' }}>{t(ROLE_KEY[user.role])}</Text>} />
        {p.grade ? <Row title={t('login_grade_label')} right={<Text style={{ color: c.ink, fontWeight: '600' }}>{t('grade_' + p.grade)}</Text>} /> : null}
        {p.subjectKey ? <Row title={t('signup_subject_label')} right={<Text style={{ color: c.ink, fontWeight: '600' }}>{t(p.subjectKey)}</Text>} /> : null}
        {p.parents ? <Row title={t('profile_parents_label')} right={<Text style={{ color: c.ink, fontWeight: '600' }}>{p.parents.join(', ') || '—'}</Text>} /> : null}
        {p.children ? <Row title={t('profile_children_label')} right={<Text style={{ color: c.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{p.children.map((ch) => ch.name).join(', ') || '—'}</Text>} /> : null}
        <Text style={{ color: c.inkSoft, fontSize: 12, marginTop: 8 }}>{t('profile_managed_note')}</Text>
      </Card>

      <Card title={t('lang_label')}>
        <Row first title={LANGUAGES.find(([v]) => v === lang)[1]} right={<Button small title={t('m_change')} onPress={() => setLangOpen(true)} />} />
      </Card>
      <LanguageSheet visible={langOpen} lang={lang} onClose={() => setLangOpen(false)} onPick={(v) => { setLanguage(v); setLangOpen(false); }} />

      <Card title={t('profile_security_title')}>
        <Text style={{ color: c.inkSoft, marginBottom: 10 }}>{t('pw_change_sub')}</Text>
        <NewPasswordForm requireCurrent onSave={changePassword} />
      </Card>

    </Screen>
  );
}

// The live classroom (camera, microphone, screen sharing) runs in the web app: "Join" opens it
// in the phone's browser. EXPO_PUBLIC_WEB_URL says where the web app is; by default the same
// computer as the backend, on the web app's port.
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || API_URL.replace(/:\d+\/api$/, ':5173')).replace(/\/+$/, '');

export function openWebApp() {
  return WebBrowser.openBrowserAsync(WEB_URL);
}
