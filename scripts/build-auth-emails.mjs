import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// No network calls, user data, credentials or sending. Supabase renders the
// remaining Go template variables when it sends a transactional email.
const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const templates = [
  {
    key: 'confirmation', label: 'Confirm sign up', subject: 'VAVE.LOG – Bestätige deine E-Mail-Adresse', link: 'signup',
    eyebrow: 'DEIN ACCOUNT', title: 'Einmal bestätigen.<br>Dann kann es losgehen.',
    preview: 'Bestätige deine E-Mail-Adresse für VAVE.LOG.',
    paragraphs: ['Willkommen bei VAVE.LOG. Mit einem Klick bestätigst du deine E-Mail-Adresse und schließt deine Registrierung ab.', 'Der Link funktioniert auf jedem Gerät – auch auf dem Smartphone.'],
    action: 'E-Mail-Adresse bestätigen',
    note: 'Du hast keinen Account erstellt? Dann ignoriere diese Nachricht. Ohne deine Bestätigung wird die Registrierung nicht abgeschlossen.',
  },
  {
    key: 'invite', label: 'Invite user', subject: 'VAVE.LOG – Deine Einladung', link: 'invite',
    eyebrow: 'DEINE EINLADUNG', title: 'Dein Zugang<br>zu VAVE.LOG.',
    preview: 'Du wurdest eingeladen, einen VAVE.LOG-Account anzulegen.',
    paragraphs: ['Du wurdest eingeladen, einen Account bei VAVE.LOG anzulegen. Über den folgenden Link nimmst du die Einladung an.', 'Der Zugang zu einem Workspace wird separat von dessen Administration vergeben.'],
    action: 'Einladung annehmen', note: 'Du hast diese Einladung nicht erwartet? Kläre sie mit der einladenden Person, bevor du den Link öffnest.',
  },
  {
    key: 'magic_link', label: 'Magic link', subject: 'VAVE.LOG – Dein Anmeldelink', link: 'magiclink',
    eyebrow: 'DEINE ANMELDUNG', title: 'Ein Klick.<br>Du bist drin.',
    preview: 'Dein persönlicher Link zur Anmeldung bei VAVE.LOG.',
    paragraphs: ['Du hast einen Anmeldelink für VAVE.LOG angefordert. Er funktioniert auf jedem Gerät – auch auf dem Smartphone.'],
    action: 'Bei VAVE.LOG anmelden', note: 'Du hast diesen Link nicht angefordert? Ignoriere die Nachricht und gib den Link nicht weiter.',
  },
  {
    key: 'recovery', label: 'Reset password', subject: 'VAVE.LOG – Passwort zurücksetzen', link: 'recovery',
    eyebrow: 'DEIN PASSWORT', title: 'Ein neues Passwort.<br>Für deinen Account.',
    preview: 'Lege ein neues Passwort für deinen VAVE.LOG-Account fest.',
    paragraphs: ['Du hast angefordert, dein Passwort zurückzusetzen. Über den folgenden Link kannst du ein neues Passwort festlegen.', 'Der Link funktioniert auf jedem Gerät – auch auf dem Smartphone.'],
    action: 'Neues Passwort festlegen', note: 'Du hast kein neues Passwort angefordert? Ignoriere diese Nachricht. Dein bisheriges Passwort bleibt gültig.',
  },
  {
    key: 'email_change', label: 'Change email address', subject: 'VAVE.LOG – Änderung deiner E-Mail-Adresse bestätigen', link: 'email_change',
    eyebrow: 'DEINE E-MAIL-ADRESSE', title: 'Neue Adresse.<br>Einmal bestätigen.',
    preview: 'Bestätige die angeforderte Änderung deiner E-Mail-Adresse.',
    paragraphs: ['Für deinen VAVE.LOG-Account wurde eine Änderung der E-Mail-Adresse angefordert. Bestätige die Änderung über den folgenden Link.', 'Wenn du je eine Bestätigung an deine bisherige und deine neue Adresse erhältst, öffne bitte beide Links.'],
    action: 'Änderung bestätigen', note: 'Du hast diese Änderung nicht angefordert? Bestätige sie nicht. Öffne VAVE.LOG über deine bekannte Adresse und prüfe deinen Account.',
  },
  {
    key: 'reauthentication', label: 'Reauthentication', subject: 'VAVE.LOG – Dein Sicherheitscode',
    eyebrow: 'SICHERHEITSBESTÄTIGUNG', title: 'Kurz bestätigen.<br>Sicher weitermachen.',
    preview: 'Dein einmaliger Sicherheitscode für VAVE.LOG.',
    paragraphs: ['Gib diesen Code in der VAVE.LOG-Abfrage ein, die du gerade geöffnet hast. So bestätigst du die angeforderte Aktion.'],
    code: true, note: 'Teile diesen Code mit niemandem. Du hast keine Aktion gestartet? Ignoriere diese Nachricht.',
  },
  ...[
    ['password_changed', 'Password changed', 'Dein Passwort wurde geändert', 'Das Passwort für deinen VAVE.LOG-Account wurde geändert.'],
    ['email_changed', 'Email address changed', 'Deine E-Mail-Adresse wurde geändert', 'Die E-Mail-Adresse deines VAVE.LOG-Accounts wurde geändert.'],
    ['phone_changed', 'Phone number changed', 'Deine Telefonnummer wurde geändert', 'Die hinterlegte Telefonnummer deines VAVE.LOG-Accounts wurde geändert.'],
    ['identity_linked', 'Sign-in method linked', 'Eine Anmeldemethode wurde verknüpft', 'Deinem VAVE.LOG-Account wurde eine weitere Anmeldemethode hinzugefügt.'],
    ['identity_unlinked', 'Sign-in method removed', 'Eine Anmeldemethode wurde entfernt', 'Eine Anmeldemethode wurde aus deinem VAVE.LOG-Account entfernt.'],
    ['mfa_factor_enrolled', 'Verification method added', 'Eine Sicherheitsmethode wurde hinzugefügt', 'Für deinen VAVE.LOG-Account wurde eine weitere Methode zur Anmeldebestätigung eingerichtet.'],
    ['mfa_factor_unenrolled', 'Verification method removed', 'Eine Sicherheitsmethode wurde entfernt', 'Eine Methode zur Anmeldebestätigung wurde aus deinem VAVE.LOG-Account entfernt.'],
  ].map(([key, label, subject, body]) => ({
    key: `${key}_notification`, label, subject: `VAVE.LOG – ${subject}`,
    eyebrow: 'DEINE KONTO-SICHERHEIT', title: `${escape(subject)}.`, preview: body,
    paragraphs: [body, 'Das warst du selbst? Dann ist nichts weiter zu tun.'],
    notification: true,
    note: 'Du warst das nicht? Öffne VAVE.LOG über deine bekannte Adresse, sichere deinen Account mit einem neuen Passwort und informiere die Person, die deinen Workspace verwaltet. Wenn du keinen Zugriff mehr hast, wende dich direkt an diese Person.',
  })),
];

const languages = {
  en: {
    label: 'English', htmlLang: 'en', subjectLabel: 'Subject', account: 'Your account', security: 'Security notification',
    footer: 'Automated message about your VAVE.LOG account.',
    linkNote: 'This link can only be used once and is valid for a limited time. If the button does not work, copy this link into your browser:',
    codeNote: 'This code can only be used once and is valid for a limited time.',
    securityEyebrow: 'YOUR ACCOUNT SECURITY', securityAcknowledgement: 'If you made this change, no further action is needed.',
    securityNote: 'If this was not you, open VAVE.LOG using your usual address, secure your account with a new password, and notify the person who manages your workspace. If you can no longer sign in, contact that person directly.',
    previewTitle: 'VAVE, right in your inbox.',
    previewNote: 'Preview of all 13 templates. These links do not send emails or sign anyone in. The code is an example. Templates become active only after email delivery is configured and they are applied in Supabase.',
  },
  de: {
    label: 'Deutsch', htmlLang: 'de', subjectLabel: 'Betreff', account: 'Dein Account', security: 'Sicherheitsbenachrichtigung',
    footer: 'Automatische Nachricht zu deinem VAVE.LOG-Konto.',
    linkNote: 'Der Link ist nur einmal und zeitlich begrenzt gültig. Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:',
    codeNote: 'Der Code ist nur einmal und zeitlich begrenzt gültig.',
    previewTitle: 'Auch im Postfach unverkennbar VAVE.',
    previewNote: 'Vorschau aller 13 Vorlagen. Die Links versenden nichts und melden niemanden an. Der gezeigte Code ist ein Beispiel. Die Vorlagen sind erst nach Einrichtung des Mailversands und Übernahme in Supabase aktiv.',
  },
  zh: {
    label: '简体中文', htmlLang: 'zh-CN', subjectLabel: '主题', account: '你的账户', security: '安全通知',
    footer: '这是一封有关你 VAVE.LOG 账户的自动通知。',
    linkNote: '此链接仅可使用一次，并在有限时间内有效。如果按钮无法使用，请将以下链接复制到浏览器中：',
    codeNote: '此验证码仅可使用一次，并在有限时间内有效。',
    securityEyebrow: '账户安全', securityAcknowledgement: '如果这是你本人的操作，则无需采取进一步行动。',
    securityNote: '如果这不是你本人的操作，请通过你平时使用的网址打开 VAVE.LOG，设置新密码以保护账户，并通知工作区管理员。如果你已无法登录，请直接联系工作区管理员。',
    previewTitle: '在收件箱中，一眼认出 VAVE。',
    previewNote: '全部 13 种模板的预览。这些链接不会发送邮件，也不会登录任何账户。验证码仅为示例。配置邮件发送服务并将模板应用到 Supabase 后，模板才会生效。',
  },
};

const translations = {
  en: {
    confirmation: {
      subject: 'Confirm your email address', eyebrow: 'YOUR ACCOUNT', title: 'One confirmation.<br>Then you’re ready.',
      preview: 'Confirm your email address for VAVE.LOG.',
      paragraphs: ['Welcome to VAVE.LOG. Confirm your email address with one click to finish creating your account.', 'The link works on any device, including your phone.'],
      action: 'Confirm email address', note: 'Did not create an account? Ignore this message. Your registration will not be completed without your confirmation.',
    },
    invite: {
      subject: 'Your invitation', eyebrow: 'YOUR INVITATION', title: 'Your access<br>to VAVE.LOG.',
      preview: 'You have been invited to create a VAVE.LOG account.',
      paragraphs: ['You have been invited to create an account with VAVE.LOG. Use the following link to accept the invitation.', 'Workspace access is granted separately by its administrator.'],
      action: 'Accept invitation', note: 'Not expecting this invitation? Check with the person who invited you before opening the link.',
    },
    magic_link: {
      subject: 'Your sign-in link', eyebrow: 'YOUR SIGN-IN', title: 'One click.<br>You’re in.',
      preview: 'Your personal link to sign in to VAVE.LOG.',
      paragraphs: ['You requested a sign-in link for VAVE.LOG. It works on any device, including your phone.'],
      action: 'Sign in to VAVE.LOG', note: 'Did not request this link? Ignore the message and do not share the link.',
    },
    recovery: {
      subject: 'Reset your password', eyebrow: 'YOUR PASSWORD', title: 'A new password.<br>For your account.',
      preview: 'Choose a new password for your VAVE.LOG account.',
      paragraphs: ['You requested a password reset. Use the following link to choose a new password.', 'The link works on any device, including your phone.'],
      action: 'Choose a new password', note: 'Did not request a new password? Ignore this message. Your current password will remain valid.',
    },
    email_change: {
      subject: 'Confirm your email address change', eyebrow: 'YOUR EMAIL ADDRESS', title: 'A new address.<br>One confirmation.',
      preview: 'Confirm the requested change to your email address.',
      paragraphs: ['A change to the email address for your VAVE.LOG account was requested. Confirm the change using the following link.', 'If you receive a confirmation at both your current and your new address, please open both links.'],
      action: 'Confirm change', note: 'Did not request this change? Do not confirm it. Open VAVE.LOG using your usual address and check your account.',
    },
    reauthentication: {
      subject: 'Your security code', eyebrow: 'SECURITY CONFIRMATION', title: 'Confirm it’s you.<br>Continue securely.',
      preview: 'Your one-time security code for VAVE.LOG.',
      paragraphs: ['Enter this code in the VAVE.LOG prompt you currently have open to confirm the requested action.'],
      note: 'Do not share this code with anyone. Did not start an action? Ignore this message.',
    },
  },
  zh: {
    confirmation: {
      subject: '确认你的电子邮箱', eyebrow: '你的账户', title: '确认邮箱，<br>即可开始。',
      preview: '确认你用于 VAVE.LOG 的电子邮箱。',
      paragraphs: ['欢迎使用 VAVE.LOG。点击下方按钮确认你的电子邮箱，即可完成账户注册。', '此链接可在任何设备上使用，包括手机。'],
      action: '确认电子邮箱', note: '你没有创建账户？请忽略此邮件。未经你的确认，注册不会完成。',
    },
    invite: {
      subject: '你的邀请', eyebrow: '你的邀请', title: '受邀加入<br>VAVE.LOG。',
      preview: '你已受邀创建 VAVE.LOG 账户。',
      paragraphs: ['你已受邀创建 VAVE.LOG 账户。请通过下方链接接受邀请。', '工作区的访问权限由该工作区的管理员另行授予。'],
      action: '接受邀请', note: '未曾预期会收到此邀请？请先与邀请人核实，再打开链接。',
    },
    magic_link: {
      subject: '你的登录链接', eyebrow: '账户登录', title: '点击一次，<br>即可登录。',
      preview: '用于登录 VAVE.LOG 的专属链接。',
      paragraphs: ['你申请了 VAVE.LOG 登录链接。它可在任何设备上使用，包括手机。'],
      action: '登录 VAVE.LOG', note: '你没有申请此链接？请忽略此邮件，也不要将链接分享给他人。',
    },
    recovery: {
      subject: '重置你的密码', eyebrow: '你的密码', title: '为你的账户<br>设置新密码。',
      preview: '为你的 VAVE.LOG 账户设置新密码。',
      paragraphs: ['你申请了重置密码。请通过下方链接设置新密码。', '此链接可在任何设备上使用，包括手机。'],
      action: '设置新密码', note: '你没有申请重置密码？请忽略此邮件。你目前的密码仍然有效。',
    },
    email_change: {
      subject: '确认更改你的电子邮箱', eyebrow: '你的电子邮箱', title: '新的邮箱，<br>确认后生效。',
      preview: '确认更改电子邮箱的申请。',
      paragraphs: ['我们收到了更改你 VAVE.LOG 账户电子邮箱的申请。请通过下方链接确认此更改。', '如果你目前的邮箱和新邮箱分别收到确认邮件，请打开这两封邮件中的链接。'],
      action: '确认更改', note: '你没有申请此更改？请不要确认。通过你平时使用的网址打开 VAVE.LOG，并检查你的账户。',
    },
    reauthentication: {
      subject: '你的安全验证码', eyebrow: '安全验证', title: '验证身份，<br>安全继续。',
      preview: '用于 VAVE.LOG 的一次性安全验证码。',
      paragraphs: ['请在你当前打开的 VAVE.LOG 验证提示中输入此验证码，以确认所申请的操作。'],
      note: '请勿将此验证码告诉任何人。你没有发起任何操作？请忽略此邮件。',
    },
  },
};

const securityTranslations = {
  en: [
    ['password_changed', 'Your password was changed', 'The password for your VAVE.LOG account was changed.'],
    ['email_changed', 'Your email address was changed', 'The email address for your VAVE.LOG account was changed.'],
    ['phone_changed', 'Your phone number was changed', 'The phone number saved in your VAVE.LOG account was changed.'],
    ['identity_linked', 'A sign-in method was linked', 'Another sign-in method was added to your VAVE.LOG account.'],
    ['identity_unlinked', 'A sign-in method was removed', 'A sign-in method was removed from your VAVE.LOG account.'],
    ['mfa_factor_enrolled', 'A verification method was added', 'Another sign-in verification method was set up for your VAVE.LOG account.'],
    ['mfa_factor_unenrolled', 'A verification method was removed', 'A sign-in verification method was removed from your VAVE.LOG account.'],
  ],
  zh: [
    ['password_changed', '你的密码已更改', '你 VAVE.LOG 账户的密码已更改。'],
    ['email_changed', '你的电子邮箱已更改', '你 VAVE.LOG 账户的电子邮箱已更改。'],
    ['phone_changed', '你的电话号码已更改', '你 VAVE.LOG 账户中保存的电话号码已更改。'],
    ['identity_linked', '已关联新的登录方式', '你的 VAVE.LOG 账户已添加另一种登录方式。'],
    ['identity_unlinked', '已移除一种登录方式', '你的 VAVE.LOG 账户已移除一种登录方式。'],
    ['mfa_factor_enrolled', '已添加新的验证方式', '你的 VAVE.LOG 账户已设置另一种登录验证方式。'],
    ['mfa_factor_unenrolled', '已移除一种验证方式', '你的 VAVE.LOG 账户已移除一种登录验证方式。'],
  ],
};
for (const [locale, entries] of Object.entries(securityTranslations)) {
  const strings = languages[locale];
  for (const [key, subject, body] of entries) translations[locale][`${key}_notification`] = {
    subject, eyebrow: strings.securityEyebrow, title: `${escape(subject)}${locale === 'zh' ? '。' : '.'}`, preview: body,
    paragraphs: [body, strings.securityAcknowledgement], note: strings.securityNote,
  };
}

function translated(template, locale) {
  if (locale === 'de') return template;
  const copy = translations[locale]?.[template.key];
  const required = ['subject', 'eyebrow', 'title', 'preview', 'paragraphs', 'note', ...(template.action ? ['action'] : [])];
  if (!copy || required.some(key => !copy[key])) throw new Error(`Incomplete ${locale} email copy: ${template.key}`);
  return { key: template.key, code: template.code, link: template.link, notification: template.notification, ...copy, subject: `VAVE.LOG – ${copy.subject}` };
}

// Go's `and` short-circuits before reading nil .Data. `printf` safely converts
// unexpected JSON metadata types for comparison; metadata is never output.
// Only canonical de/zh select a branch; missing/unknown values use English.
const localized = variants => `{{ if and .Data (eq (printf "%s" .Data.locale) "de") }}${variants.de}{{ else if and .Data (eq (printf "%s" .Data.locale) "zh") }}${variants.zh}{{ else }}${variants.en}{{ end }}`;
// Token-Hash-Links landen auf der Site und werden erst dort von der App eingelöst (verifyOtp). So verbraucht
// kein Link-Scanner im Mailprogramm den Token, und der Link funktioniert auf jedem Gerät. `?reset=1` bringt den
// Passwortreset in den richtigen Bildschirm, bevor der Token eingelöst ist.
const actionLink = template => `{{ .SiteURL }}/?${template.link === 'recovery' ? 'reset=1&amp;' : ''}token_hash={{ .TokenHash }}&amp;type=${template.link}`;
const paragraph = text => `<p style="margin:0 0 18px;color:#3e4439;font-size:16px;line-height:26px;">${escape(text)}</p>`;
function card(template, locale) {
  const strings = languages[locale];
  if (template.action && !template.link) throw new Error(`Missing token link type: ${template.key}`);
  const href = template.action ? actionLink(template) : '';
  const action = template.action ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;"><tr><td bgcolor="#641dff" style="border-radius:8px;text-align:center;"><a href="${href}" style="display:inline-block;border:16px solid #641dff;border-left-width:22px;border-right-width:22px;border-radius:8px;background:#641dff;color:#ffffff;font-size:16px;font-weight:bold;line-height:22px;text-decoration:none;mso-padding-alt:0;">${escape(template.action)}</a></td></tr></table>
<p style="margin:0 0 24px;color:#5f655a;font-size:13px;line-height:21px;">${escape(strings.linkNote)}<br><a href="${href}" style="color:#641dff;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${href}</a></p>` : '';
  const code = template.code ? `<div style="margin:26px 0;padding:20px 12px;background:#e8ffb9;border:1px solid #d8edb0;border-radius:8px;text-align:center;font-family:Consolas,'Courier New',monospace;font-size:30px;line-height:40px;letter-spacing:5px;color:#1b1b1b;">{{ .Token }}</div><p style="margin:0 0 24px;color:#5f655a;font-size:13px;line-height:21px;">${escape(strings.codeNote)}</p>` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e8e3;border-radius:16px;overflow:hidden;">
<tr><td bgcolor="#e8ffb9" class="email-pad" style="padding:30px 36px;background:#e8ffb9;border-radius:16px 16px 0 0;">
<div aria-label="VAVE.LOG" style="font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:38px;letter-spacing:-2px;color:#1b1b1b;"><strong style="font-weight:800;">VAVE</strong><span style="font-weight:400;color:#641dff;">.LOG</span></div>
</td></tr>
<tr><td class="email-pad" style="padding:36px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 16px;font-size:11px;font-weight:bold;line-height:18px;letter-spacing:2px;color:#641dff;">${escape(template.eyebrow)}</p>
<h1 class="email-title" style="margin:0 0 24px;font-size:32px;font-weight:600;line-height:38px;letter-spacing:-1px;color:#1b1b1b;">${template.title}</h1>
${template.paragraphs.map(paragraph).join('\n')}
${action}${code}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f8f9f6" style="padding:18px 20px;border-left:3px solid #641dff;background:#f8f9f6;color:#5f655a;font-size:13px;line-height:21px;">${escape(template.note)}</td></tr></table>
</td></tr>
<tr><td class="email-pad" style="padding:22px 36px;border-top:1px solid #e7e8e3;color:#5f655a;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;">VAVE.LOG &middot; ${escape(template.notification ? strings.security : strings.account)}<br>${escape(strings.footer)}</td></tr>
</table>`;
}
function email(template, locale) {
  return `<!doctype html>
<html lang="${languages[locale].htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><title>${escape(template.subject)}</title>
<style>@media only screen and (max-width:480px){.email-pad{padding-left:24px!important;padding-right:24px!important}.email-title{font-size:28px!important;line-height:34px!important;overflow-wrap:anywhere}.email-outer{padding:16px 8px!important}}</style></head>
<body style="margin:0;padding:0;width:100%;background:#f8f9f6;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#f8f9f6;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(template.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8f9f6"><tr><td align="center" class="email-outer" style="padding:40px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
${card(template, locale)}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>
`;
}

const outputs = new Map();
const payload = {};
for (const template of templates) {
  const variants = Object.fromEntries(Object.keys(languages).map(locale => [locale, translated(template, locale)]));
  const body = `${localized(Object.fromEntries(Object.entries(variants).map(([locale, variant]) => [locale, email(variant, locale)])))}\n`;
  outputs.set(`supabase/templates/${template.key}.html`, body);
  payload[`mailer_subjects_${template.key}`] = localized(Object.fromEntries(Object.entries(variants).map(([locale, variant]) => [locale, variant.subject])));
  payload[`mailer_templates_${template.key}_content`] = body;
}
// Template-only PATCH. Do not silently alter redirects, SMTP, verification,
// notification switches, providers, registration or other Auth settings.
outputs.set('supabase/auth-email-branding.json', `${JSON.stringify(payload, null, 2)}\n`);
outputs.set('supabase/templates/subjects.json', `${JSON.stringify(Object.fromEntries(templates.map(t => [t.key, { dashboard: t.label, subject: payload[`mailer_subjects_${t.key}`] }])), null, 2)}\n`);
const previewCard = (template, locale) => card(template, locale)
  .replace(/href="\{\{ \.SiteURL \}\}[^"]*"/g, `href="#preview-note-${locale}"`)
  .replaceAll('{{ .SiteURL }}', 'https://hannespix.github.io/vave.log')
  .replaceAll('{{ .TokenHash }}', '…')
  .replaceAll('{{ .Token }}', '123456');
const languageLinks = Object.entries(languages).map(([locale, strings]) => `<a href="#language-${locale}" lang="${strings.htmlLang}">${strings.label}</a>`).join('');
outputs.set('docs/email-preview.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VAVE.LOG – Email templates / E-Mail-Vorlagen / 邮件模板</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8f9f6;color:#1b1b1b;font-family:Arial,Helvetica,sans-serif;line-height:1.6}main{max-width:660px;margin:40px auto;padding:0 16px}header{margin-bottom:36px}header h1{font-size:36px;line-height:1.15;letter-spacing:-1px;margin-bottom:12px}header p,article>p{color:#5f655a;font-size:14px}nav{display:flex;flex-wrap:wrap;gap:8px}nav a{color:#641dff;border:1px solid #e0d5ff;background:white;padding:5px 10px;border-radius:6px;font-size:12px;text-decoration:none}section{margin:64px 0;scroll-margin-top:24px}article{margin:48px 0;scroll-margin-top:24px}article>h2{font-size:17px;margin-bottom:4px}article>p{margin-top:0}@media(max-width:480px){.email-pad{padding-left:24px!important;padding-right:24px!important}.email-title{font-size:28px!important;line-height:34px!important;overflow-wrap:anywhere}}
</style></head><body><main><nav aria-label="Languages">${languageLinks}</nav>
${Object.entries(languages).map(([locale, strings]) => `<section id="language-${locale}" lang="${strings.htmlLang}"><header><p>VAVE.LOG / ${strings.label}</p><h1>${escape(strings.previewTitle)}</h1><p id="preview-note-${locale}">${escape(strings.previewNote)}</p><nav>${templates.map(template => `<a href="#${locale}-${template.key}">${escape(translated(template, locale).subject.replace('VAVE.LOG – ', ''))}</a>`).join('')}</nav></header>
${templates.map(template => {
  const variant = translated(template, locale);
  return `<article id="${locale}-${template.key}"><h2>${escape(variant.subject.replace('VAVE.LOG – ', ''))}</h2><p>${escape(strings.subjectLabel)}: ${escape(variant.subject)}</p>${previewCard(variant, locale)}</article>`;
}).join('\n')}<nav aria-label="Languages">${languageLinks}</nav></section>`).join('\n')}
</main></body></html>
`);

let different = false;
for (const [relative, content] of outputs) {
  const file = path.join(root, relative);
  if (check) {
    const existing = await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing !== content) { console.error(`Out of date: ${relative}`); different = true; }
  } else {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}
if (different) { console.error('Run npm run emails:build and commit the generated changes.'); process.exitCode = 1; }
else console.log(`${templates.length} VAVE.LOG email templates in ${Object.keys(languages).length} languages ${check ? 'up to date' : 'generated'} (no sending or hosted Supabase changes).`);
