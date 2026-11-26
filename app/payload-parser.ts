import { isSafeWebUrl } from './scanner-utils';

export type PayloadType = 'url' | 'wifi' | 'tel' | 'email' | 'sms' | 'geo' | 'contact' | 'product' | 'text';
export type PayloadField = { label: string; value: string; secret?: boolean };
export type PayloadAction = { kind: 'open' | 'copy'; label: string; value: string };
export type ParsedPayload = { type: PayloadType; title: string; fields: PayloadField[]; actions: PayloadAction[] };

const TITLES: Record<PayloadType, string> = {
  url: '網址', wifi: 'Wi‑Fi', tel: '電話', email: 'Email', sms: '簡訊', geo: '地點', contact: '聯絡人', product: '商品條碼', text: '文字',
};
const make = (type: PayloadType, fields: PayloadField[] = [], actions: PayloadAction[] = []): ParsedPayload => ({ type, title: TITLES[type], fields, actions });
const field = (label: string, value: string, secret?: boolean): PayloadField => secret ? { label, value, secret } : { label, value };
const open = (label: string, value: string): PayloadAction => ({ kind: 'open', label, value });
const copy = (label: string, value: string): PayloadAction => ({ kind: 'copy', label, value });
const prefix = (text: string, name: string) => text.slice(0, name.length).toLowerCase() === name.toLowerCase() ? text.slice(name.length) : null;
const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
const phone = (value: string) => value.replace(/[^\d+*#]/g, '');
const query = (value: string) => Object.fromEntries(value.split('&').filter(Boolean).map(pair => {
  const index = pair.indexOf('=');
  return [(index < 0 ? pair : pair.slice(0, index)).toLowerCase(), decode((index < 0 ? '' : pair.slice(index + 1)).replace(/\+/g, ' '))];
})) as Record<string, string | undefined>;
const withQuery = (base: string, params: [string, string][]) => {
  const parts = params.filter(([, value]) => value).map(([key, value]) => key + '=' + encodeURIComponent(value));
  return parts.length ? base + '?' + parts.join('&') : base;
};
const mailtoUrl = (to: string, subject = '', body = '') =>
  withQuery('mailto:' + encodeURIComponent(to).replace(/%40/g, '@').replace(/%2C/gi, ','), [['subject', subject], ['body', body]]);
const splitAt = (value: string, separator: string): [string, string] => {
  const index = value.indexOf(separator);
  return index < 0 ? [value, ''] : [value.slice(0, index), value.slice(index + 1)];
};

// Parses "KEY:value;KEY:value;;" with backslash escapes and optional quoted values.
function parseKeyValues(text: string): [string, string][] {
  const pairs: [string, string][] = [];
  let key = '', value = '', inKey = true, quoted = false;
  const push = () => { if (!inKey) pairs.push([key.toUpperCase(), value]); key = ''; value = ''; inKey = true; quoted = false; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length) { if (inKey) key += text[++i]; else value += text[++i]; }
    else if (!inKey && char === '"') quoted = !quoted;
    else if (inKey && char === ':') inKey = false;
    else if (!inKey && char === ';' && !quoted) push();
    else if (inKey && char === ';') key = '';
    else if (inKey) key += char;
    else value += char;
  }
  push();
  return pairs;
}
const getRaw = (pairs: [string, string][], key: string) => pairs.find(([name]) => name === key)?.[1] || '';
const getAll = (pairs: [string, string][], key: string) => pairs.filter(([name]) => name === key).map(([, value]) => value.trim()).filter(Boolean);

function parseWifi(rest: string) {
  const pairs = parseKeyValues(rest);
  const ssid = getRaw(pairs, 'S');
  if (!ssid) return null;
  const type = getRaw(pairs, 'T').trim().toUpperCase();
  const password = getRaw(pairs, 'P');
  const fields = [field('網路名稱', ssid), field('加密', /^(WPA\d?|SAE)$/.test(type) ? 'WPA' : type === 'WEP' ? 'WEP' : '無')];
  if (password) fields.push(field('密碼', password, true));
  if (getRaw(pairs, 'H').trim().toLowerCase() === 'true') fields.push(field('隱藏網路', '是'));
  return make('wifi', fields, password ? [copy('複製密碼', password)] : []);
}

function parseTel(number: string) {
  const clean = phone(decode(number.trim()));
  return /\d/.test(clean) ? make('tel', [field('號碼', clean)], [open('撥打', 'tel:' + clean), copy('複製號碼', clean)]) : null;
}

function buildEmail(to: string, subject = '', body = '') {
  if (!to || /[\s<>]/.test(to)) return null;
  const fields = [field('收件人', to)];
  if (subject) fields.push(field('主旨', subject));
  if (body) fields.push(field('內容', body));
  return make('email', fields, [open('寫信', mailtoUrl(to, subject, body))]);
}
function parseMailto(rest: string) {
  const [path, search] = splitAt(rest, '?');
  const params = query(search);
  return buildEmail(decode(path).trim(), params.subject, params.body);
}
function parseMatmsg(rest: string) {
  const pairs = parseKeyValues(rest);
  return buildEmail(getRaw(pairs, 'TO').trim(), getRaw(pairs, 'SUB'), getRaw(pairs, 'BODY'));
}

function buildSms(number: string, message = '') {
  const clean = phone(number);
  if (!/\d/.test(clean)) return null;
  const fields = [field('號碼', clean)];
  if (message) fields.push(field('內容', message));
  return make('sms', fields, [open('傳簡訊', withQuery('sms:' + clean, [['body', message]]))]);
}
const parseSmsto = (rest: string) => buildSms(...splitAt(rest, ':'));
function parseSms(rest: string) {
  const [number, search] = splitAt(rest.replace(';', '?'), '?');
  return buildSms(decode(number), query(search).body);
}

function parseGeo(rest: string) {
  const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,-?\d+(?:\.\d+)?)?(?:[;?].*)?$/.exec(rest);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return null;
  const [a, b] = [String(lat), String(lng)];
  return make('geo', [field('緯度', a), field('經度', b)], [open('在地圖開啟', `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=17/${a}/${b}`)]);
}

type Contact = { name: string; phones: string[]; emails: string[]; org: string; urls: string[] };
function buildContact({ name, phones, emails, org, urls }: Contact) {
  const fields: PayloadField[] = [];
  if (name) fields.push(field('姓名', name));
  phones.forEach(value => fields.push(field('電話', value)));
  emails.forEach(value => fields.push(field('Email', value)));
  if (org) fields.push(field('公司', org));
  urls.forEach(value => fields.push(field('網址', value)));
  if (!fields.length) return null;
  const actions: PayloadAction[] = [];
  const dial = phones.map(phone).find(value => /\d/.test(value));
  if (dial) actions.push(open('撥打', 'tel:' + dial));
  if (emails[0] && !/[\s<>]/.test(emails[0])) actions.push(open('寫信', mailtoUrl(emails[0])));
  const url = urls.find(isSafeWebUrl);
  if (url) actions.push(open('開啟網址', new URL(url).href));
  return make('contact', fields, actions);
}
function parseVcard(text: string) {
  const unescape = (value: string) => value.replace(/\\([nN,;\\])/g, (_, char: string) => char === 'n' || char === 'N' ? '\n' : char).trim();
  const contact: Contact = { name: '', phones: [], emails: [], org: '', urls: [] };
  let structured = '';
  for (const line of text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n')) {
    const [head, value] = splitAt(line, ':');
    const name = head.split(';')[0].split('.').pop()!.trim().toUpperCase();
    if (!head || !value) continue;
    if (name === 'FN') contact.name ||= unescape(value);
    else if (name === 'N') { const [family, given] = value.split(';'); structured ||= [given, family].map(part => unescape(part || '')).filter(Boolean).join(' '); }
    else if (name === 'TEL') { const v = unescape(value).replace(/^tel:/i, ''); if (v) contact.phones.push(v); }
    else if (name === 'EMAIL') { const v = unescape(value); if (v) contact.emails.push(v); }
    else if (name === 'ORG') contact.org ||= value.split(';').map(unescape).filter(Boolean).join(' ');
    else if (name === 'URL') { const v = unescape(value); if (v) contact.urls.push(v); }
  }
  contact.name ||= structured;
  return buildContact(contact);
}
function parseMecard(rest: string) {
  const pairs = parseKeyValues(rest);
  const name = getRaw(pairs, 'N').split(',').reverse().map(part => part.trim()).filter(Boolean).join(' ');
  return buildContact({ name, phones: getAll(pairs, 'TEL'), emails: getAll(pairs, 'EMAIL'), org: getAll(pairs, 'ORG')[0] || '', urls: getAll(pairs, 'URL') });
}

const gtinValid = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
};
function upceToUpca(code: string) {
  const [system, a, b, c, d, e, f] = code;
  const body = '012'.includes(f) ? a + b + f + '0000' + c + d + e
    : f === '3' ? a + b + c + '00000' + d + e
    : f === '4' ? a + b + c + d + '00000' + e
    : a + b + c + d + e + '0000' + f;
  return system + body + code[7];
}
function parseProduct(text: string, format: string) {
  const name = format.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const lengths: Record<string, number> = { EAN13: 13, EAN8: 8, UPCA: 12, UPCE: 8 };
  if (lengths[name] !== text.length || !/^\d+$/.test(text)) return null;
  if (!gtinValid(name === 'UPCE' ? upceToUpca(text) : text)) return null;
  return make('product', [field('GTIN', text), field('類型', format)], [copy('複製號碼', text)]);
}

export function parsePayload(text: string, format: string): ParsedPayload {
  try {
    const value = String(text ?? '').trim();
    let rest: string | null;
    let result: ParsedPayload | null = null;
    if (isSafeWebUrl(value)) {
      const url = new URL(value);
      result = make('url', [field('網域', url.hostname)], [open('開啟網址', url.href)]);
    }
    else if ((rest = prefix(value, 'WIFI:')) !== null) result = parseWifi(rest);
    else if ((rest = prefix(value, 'tel:')) !== null) result = parseTel(rest);
    else if ((rest = prefix(value, 'mailto:')) !== null) result = parseMailto(rest);
    else if ((rest = prefix(value, 'MATMSG:')) !== null) result = parseMatmsg(rest);
    else if ((rest = prefix(value, 'SMSTO:')) !== null) result = parseSmsto(rest);
    else if ((rest = prefix(value, 'sms:')) !== null) result = parseSms(rest);
    else if ((rest = prefix(value, 'geo:')) !== null) result = parseGeo(rest);
    else if (/^BEGIN:VCARD/i.test(value)) result = parseVcard(value);
    else if ((rest = prefix(value, 'MECARD:')) !== null) result = parseMecard(rest);
    else result = parseProduct(value, String(format ?? ''));
    return result ?? make('text');
  } catch {
    return make('text');
  }
}
