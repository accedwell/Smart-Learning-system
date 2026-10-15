// Before logging in: login, the forced first-login password change and "forgot password".
// Nobody signs up: the school administrator creates every account.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiPost, errorText } from '../api';
import { LANGUAGES } from '../i18n';
import { Button, ErrorText, PasswordField, Sheet, useKit } from '../ui';

const MIN_PASSWORD = 8;
const NAVY = '#0f1a38';
const GOLD = '#f2b25a';

function LanguageButton() {
  const { t, lang, setLanguage } = useKit();
  const [open, setOpen] = useState(false);
  const label = LANGUAGES.find(([v]) => v === lang)[1];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.langBtn} accessibilityLabel={t('lang_label')}>
        <Ionicons name="globe-outline" size={16} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{label}</Text>
        <Ionicons name="chevron-down" size={14} color="#ffffffb0" />
      </Pressable>
      <LanguageSheet visible={open} onClose={() => setOpen(false)} lang={lang} onPick={(v) => { setLanguage(v); setOpen(false); }} />
    </>
  );
}

export function LanguageSheet({ visible, onClose, lang, onPick }) {
  const { t, c } = useKit();
  return (
    <Sheet visible={visible} title={t('lang_label')} onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {LANGUAGES.map(([value, label]) => (
          <Pressable key={value} onPress={() => onPick(value)}
            style={[styles.langOpt, { borderColor: lang === value ? c.brand : c.border, backgroundColor: c.surface }]}>
            <Text style={{ color: c.ink, fontSize: 16, fontWeight: lang === value ? '700' : '500' }}>{label}</Text>
            {lang === value ? <Ionicons name="checkmark-circle" size={22} color={c.brand} /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

// The look every sign-in screen shares: a navy background with soft gold light, the Smart
// Learning mark, and the form on a raised card.
function AuthShell({ icon = 'school', heading, sub, children, footer }) {
  const { c, t } = useKit();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <View style={[styles.glow, styles.glowTop]} />
      <View style={[styles.glow, styles.glowBottom]} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 }}>
          <View style={{ alignItems: 'flex-end' }}><LanguageButton /></View>

          <View style={styles.brand}>
            <View style={styles.mark}><Ionicons name={icon} size={34} color={NAVY} /></View>
            <Text style={styles.appName}>{t('app_title')}</Text>
            <Text style={styles.tagline}>
              {t('landing_headline_pre')}<Text style={{ color: GOLD }}>{t('landing_headline_highlight')}</Text>{t('landing_headline_post')}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: c.surface }]}>
            <Text style={[styles.heading, { color: c.ink }]}>{heading}</Text>
            {sub ? <Text style={{ color: c.inkSoft, fontSize: 14, lineHeight: 20, marginBottom: 18 }}>{sub}</Text> : <View style={{ height: 14 }} />}
            {children}
          </View>

          {footer}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// a text box with an icon in front (and an eye button for passwords)
function AuthInput({ icon, label, secure, value, onChangeText, ...input }) {
  const { c, t } = useKit();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: c.inkSoft, fontWeight: '600', fontSize: 13, marginBottom: 6 }}>{label}</Text>
      <View style={[styles.inputRow, { backgroundColor: c.bg, borderColor: focused ? c.brand : c.border }]}>
        <Ionicons name={icon} size={19} color={focused ? c.brand : c.inkSoft} />
        <TextInput
          value={value} onChangeText={onChangeText} secureTextEntry={secure && !shown}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholderTextColor={c.inkSoft} style={[styles.input, { color: c.ink }]} {...input}
        />
        {secure ? (
          <Pressable onPress={() => setShown((s) => !s)} hitSlop={10} accessibilityLabel={shown ? t('pw_hide') : t('pw_show')}>
            <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.inkSoft} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const NoAccount = () => {
  const { t } = useKit();
  return (
    <View style={styles.footer}>
      <Ionicons name="information-circle-outline" size={17} color="#ffffffa0" />
      <Text style={styles.footerText}>{t('auth_no_account')}</Text>
    </View>
  );
};

export function Login({ onForgot }) {
  const { t, has, enter, c } = useKit();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await apiPost('/auth/login', { email: email.trim(), password });
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    enter(data);
  }

  return (
    <AuthShell heading={t('login_title')} sub={t('login_subtitle')} footer={<NoAccount />}>
      <AuthInput icon="mail-outline" label={t('login_email_label')} value={email} onChangeText={setEmail}
        placeholder={t('login_email_placeholder')} autoCapitalize="none" autoComplete="email" keyboardType="email-address"
        textContentType="username" returnKeyType="next" />
      <AuthInput icon="lock-closed-outline" label={t('login_password_label')} value={password} onChangeText={setPassword}
        secure autoCapitalize="none" autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: c.bad + '1a' }]}>
          <Ionicons name="alert-circle" size={18} color={c.bad} />
          <Text style={{ color: c.bad, flex: 1, fontSize: 13.5 }}>{error}</Text>
        </View>
      ) : null}
      <Pressable onPress={onForgot} hitSlop={8} style={{ alignSelf: 'flex-end', marginBottom: 18 }}>
        <Text style={{ color: c.brand, fontWeight: '700' }}>{t('forgot_password_link')}</Text>
      </Pressable>
      <Button kind="primary" title={t('login_button')} onPress={submit} busy={busy} disabled={!email.trim() || !password}
        style={{ paddingVertical: 16, borderRadius: 16 }} />
    </AuthShell>
  );
}

// a new password, with the checks the web app makes; onSave(next, current) resolves to an error or nothing
export function NewPasswordForm({ requireCurrent, onSave, saveLabel }) {
  const { t } = useKit();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (next.length < MIN_PASSWORD) return setError(t('pw_error_short', { n: MIN_PASSWORD }));
    if (next !== confirm) return setError(t('signup_password_mismatch'));
    setError(null);
    setBusy(true);
    const err = await onSave(next, current);
    setBusy(false);
    if (err) setError(err);
    else { setCurrent(''); setNext(''); setConfirm(''); }
  }

  return (
    <View>
      {requireCurrent ? <PasswordField label={t('pw_current_label')} value={current} onChangeText={setCurrent} autoComplete="current-password" /> : null}
      <PasswordField label={t('pw_new_label')} value={next} onChangeText={setNext} autoComplete="new-password" />
      <PasswordField label={t('pw_confirm_label')} value={confirm} onChangeText={setConfirm} autoComplete="new-password" />
      <ErrorText>{error}</ErrorText>
      <Button kind="primary" title={saveLabel || t('pw_save_btn')} onPress={submit} busy={busy}
        disabled={!next || !confirm || (requireCurrent && !current)} />
    </View>
  );
}

export function FirstLogin() {
  const { t, has, pending, enter, cancelPending, c } = useKit();
  async function save(newPassword) {
    const { data, error } = await apiPost('/auth/change-password', { newPassword }, pending.token);
    if (error) return errorText(t, has, error);
    enter(data);
    return null;
  }
  return (
    <AuthShell icon="key" heading={t('pw_change_title')} sub={t('pw_change_forced_sub')}>
      <View style={[styles.who, { backgroundColor: c.chip }]}>
        <Ionicons name="person-circle" size={22} color={c.brand} />
        <Text style={{ color: c.ink, fontWeight: '600', flex: 1 }} numberOfLines={1}>{pending.user.name} · {pending.user.email}</Text>
      </View>
      <NewPasswordForm onSave={save} />
      <Button title={t('pw_cancel_btn')} onPress={cancelPending} style={{ marginTop: 10 }} />
    </AuthShell>
  );
}

export function Forgot({ onBack }) {
  const { t, has, c } = useKit();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    const { error: err } = await apiPost('/auth/forgot-password', { email: email.trim() });
    setBusy(false);
    if (err) return setError(errorText(t, has, err));
    setSentTo(email.trim());
  }

  const back = (
    <Pressable onPress={onBack} style={styles.footer} hitSlop={8}>
      <Ionicons name="arrow-back" size={17} color={GOLD} />
      <Text style={{ color: GOLD, fontWeight: '700' }}>{t('forgot_back_to_login')}{t('forgot_back_to_login_link')}</Text>
    </Pressable>
  );

  if (sentTo) {
    return (
      <AuthShell icon="mail-open" heading={t('forgot_success_title')} sub={t('forgot_success_note', { value: sentTo })} footer={back}>
        <Button kind="primary" title={t('forgot_back_to_login_link')} onPress={onBack} style={{ paddingVertical: 16, borderRadius: 16 }} />
        <Button title={t('forgot_resend_btn')} onPress={send} busy={busy} style={{ marginTop: 10 }} />
      </AuthShell>
    );
  }
  return (
    <AuthShell icon="key" heading={t('forgot_title')} sub={t('forgot_subtitle')} footer={back}>
      <AuthInput icon="mail-outline" label={t('forgot_email_label')} value={email} onChangeText={setEmail}
        placeholder={t('forgot_email_placeholder')} autoCapitalize="none" keyboardType="email-address" autoComplete="email"
        returnKeyType="send" onSubmitEditing={send} />
      {error ? <Text style={{ color: c.bad, marginBottom: 10 }}>{error}</Text> : null}
      <Button kind="primary" title={t('forgot_submit_btn')} onPress={send} busy={busy} disabled={!email.trim()}
        style={{ paddingVertical: 16, borderRadius: 16 }} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', borderRadius: 999, backgroundColor: '#b8791f' },
  glowTop: { width: 420, height: 420, top: -210, right: -160, opacity: 0.45 },
  glowBottom: { width: 360, height: 360, bottom: -230, left: -170, opacity: 0.22 },
  brand: { alignItems: 'center', marginTop: 18, marginBottom: 26 },
  mark: {
    width: 74, height: 74, borderRadius: 24, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
    shadowColor: GOLD, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  appName: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 16, letterSpacing: -0.3 },
  tagline: { color: '#ffffffc8', fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginTop: 6, paddingHorizontal: 16 },
  card: {
    borderRadius: 28, padding: 22,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10,
  },
  heading: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 16, paddingVertical: 14 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 11, marginBottom: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 11, marginBottom: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22, paddingHorizontal: 12 },
  footerText: { color: '#ffffffb0', fontSize: 13, textAlign: 'center', flexShrink: 1 },
  langBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  langOpt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, padding: 14 },
});
