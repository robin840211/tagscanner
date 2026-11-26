import { describe, expect, it } from 'vitest';
import { parsePayload } from '../app/payload-parser';

const opens = (text: string, format = 'QRCode') => parsePayload(text, format).actions.filter(action => action.kind === 'open').map(action => action.value);
const labels = (text: string, format = 'QRCode') => parsePayload(text, format).fields.map(item => item.label + '=' + item.value);

describe('url payloads', () => {
  it('parses http(s) URLs with trimming', () => {
    const result = parsePayload('  https://Example.com/a?b=1  ', 'QRCode');
    expect(result.type).toBe('url');
    expect(result.fields).toEqual([{ label: '網域', value: 'example.com' }]);
    expect(result.actions).toEqual([{ kind: 'open', label: '開啟網址', value: 'https://example.com/a?b=1' }]);
  });
  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://example.com', 'file:///etc/passwd', 'hello world', ''])('treats %s as text', value => {
    const result = parsePayload(value, 'QRCode');
    expect(result.type).toBe('text');
    expect(result.title).toBe('文字');
    expect(result.fields).toEqual([]);
    expect(result.actions).toEqual([]);
  });
});

describe('wifi payloads', () => {
  it('parses fields and masks the password as secret', () => {
    const result = parsePayload('WIFI:T:WPA;S:Home;P:pass1234;H:true;;', 'QRCode');
    expect(result.type).toBe('wifi');
    expect(result.fields).toEqual([
      { label: '網路名稱', value: 'Home' },
      { label: '加密', value: 'WPA' },
      { label: '密碼', value: 'pass1234', secret: true },
      { label: '隱藏網路', value: '是' },
    ]);
    expect(result.actions).toEqual([{ kind: 'copy', label: '複製密碼', value: 'pass1234' }]);
  });
  it('handles escapes, quotes and open networks', () => {
    expect(labels('wifi:S:a\\;b\\:c\\\\d;T:WEP;P:"p\\,w";;')).toEqual(['網路名稱=a;b:c\\d', '加密=WEP', '密碼=p,w']);
    const open = parsePayload('WIFI:T:nopass;S:Cafe;;', 'QRCode');
    expect(open.fields).toEqual([{ label: '網路名稱', value: 'Cafe' }, { label: '加密', value: '無' }]);
    expect(open.actions).toEqual([]);
  });
  it('falls back to text without an SSID', () => {
    expect(parsePayload('WIFI:T:WPA;P:x;;', 'QRCode').type).toBe('text');
  });
  it('keeps the encryption name for enterprise networks', () => {
    expect(labels('WIFI:T:WPA2-EAP;S:Corp;P:x;;')).toContain('加密=WPA2-EAP');
    expect(labels('WIFI:S:Corp;P:x;;')).toContain('加密=未標示');
  });
});

describe('phone, email and sms payloads', () => {
  it('sanitizes phone numbers', () => {
    const result = parsePayload('TEL:+886 (2) 1234-5678;javascript:x', 'QRCode');
    expect(result.type).toBe('tel');
    expect(result.fields).toEqual([{ label: '號碼', value: '+886212345678' }]);
    expect(result.actions).toEqual([
      { kind: 'open', label: '撥打', value: 'tel:+886212345678' },
      { kind: 'copy', label: '複製號碼', value: '+886212345678' },
    ]);
    expect(parsePayload('tel:abc', 'QRCode').type).toBe('text');
  });
  it('encodes # so service codes reach the dialer intact', () => {
    expect(opens('tel:*#06#')).toEqual(['tel:*%2306%23']);
  });
  it('parses mailto with encoded subject and body', () => {
    const result = parsePayload('mailto:a@b.com?subject=Hi%20there&body=x%26y', 'QRCode');
    expect(result.type).toBe('email');
    expect(labels('mailto:a@b.com?subject=Hi%20there&body=x%26y')).toEqual(['收件人=a@b.com', '主旨=Hi there', '內容=x&y']);
    expect(opens('mailto:a@b.com?subject=Hi%20there&body=x%26y')).toEqual(['mailto:a@b.com?subject=Hi%20there&body=x%26y']);
  });
  it('parses MATMSG', () => {
    expect(labels('MATMSG:TO:me@x.org;SUB:Hello;BODY:A B;;')).toEqual(['收件人=me@x.org', '主旨=Hello', '內容=A B']);
    expect(opens('MATMSG:TO:me@x.org;SUB:Hello;BODY:A B;;')).toEqual(['mailto:me@x.org?subject=Hello&body=A%20B']);
    expect(parsePayload('MATMSG:SUB:x;;', 'QRCode').type).toBe('text');
  });
  it('parses SMSTO and sms: forms', () => {
    const result = parsePayload('SMSTO:+886912345678:Hi: there', 'QRCode');
    expect(result.type).toBe('sms');
    expect(opens('SMSTO:+886912345678:Hi: there')).toEqual(['sms:+886912345678?body=Hi%3A%20there']);
    expect(labels('sms:0912-345-678?body=yo')).toEqual(['號碼=0912345678', '內容=yo']);
    expect(opens('sms:0912345678')).toEqual(['sms:0912345678']);
  });
});

describe('geo payloads', () => {
  it('builds an OpenStreetMap link', () => {
    const result = parsePayload('geo:25.033,121.5654,10?q=Taipei', 'QRCode');
    expect(result.type).toBe('geo');
    expect(result.fields).toEqual([{ label: '緯度', value: '25.033' }, { label: '經度', value: '121.5654' }]);
    expect(opens('geo:25.033,121.5654')).toEqual(['https://www.openstreetmap.org/?mlat=25.033&mlon=121.5654#map=17/25.033/121.5654']);
  });
  it.each(['geo:91,0', 'geo:0,181', 'geo:abc,def', 'geo:1'])('rejects %s', value => {
    expect(parsePayload(value, 'QRCode').type).toBe('text');
  });
});

describe('contact payloads', () => {
  it('parses vCard with folding, CRLF and typed params', () => {
    const card = [
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Chen;Robin;;;', 'FN:Robin Chen', 'ORG:Acme\\, Inc.;Lab',
      'TEL;TYPE=CELL:+886 912-345-678', 'item1.TEL;TYPE=WORK:02-1234', 'EMAIL;TYPE=INTERNET:robin@exa', ' mple.com',
      'URL:https://exam', ' ple.com/me', 'END:VCARD',
    ].join('\r\n');
    const result = parsePayload(card, 'QRCode');
    expect(result.type).toBe('contact');
    expect(result.fields).toEqual([
      { label: '姓名', value: 'Robin Chen' },
      { label: '電話', value: '+886 912-345-678' },
      { label: '電話', value: '02-1234' },
      { label: 'Email', value: 'robin@example.com' },
      { label: '公司', value: 'Acme, Inc. Lab' },
      { label: '網址', value: 'https://example.com/me' },
    ]);
    expect(opens(card)).toEqual(['tel:+886912345678', 'mailto:robin@example.com', 'https://example.com/me']);
  });
  it('falls back to the structured name and ignores unsafe URLs', () => {
    const result = parsePayload('begin:vcard\nN:Chen;Robin\nURL:javascript:alert(1)\nEND:VCARD', 'QRCode');
    expect(result.fields).toEqual([{ label: '姓名', value: 'Robin Chen' }, { label: '網址', value: 'javascript:alert(1)' }]);
    expect(result.actions).toEqual([]);
  });
  it('parses MECARD', () => {
    const result = parsePayload('MECARD:N:Chen,Robin;TEL:0912345678;TEL:02-1234;EMAIL:r@x.com;ORG:Acme;URL:http://x.com;;', 'QRCode');
    expect(result.type).toBe('contact');
    expect(result.fields.map(item => item.label)).toEqual(['姓名', '電話', '電話', 'Email', '公司', '網址']);
    expect(result.fields[0].value).toBe('Robin Chen');
    expect(result.actions.map(action => action.value)).toEqual(['tel:0912345678', 'mailto:r@x.com', 'http://x.com/']);
    expect(parsePayload('MECARD:;;', 'QRCode').type).toBe('text');
  });
});

describe('product barcodes', () => {
  it.each([
    ['4006381333931', 'EAN13'],
    ['4006381333931', 'EAN-13'],
    ['96385074', 'EAN8'],
    ['036000291452', 'UPCA'],
    ['036000291452', 'UPC-A'],
    ['01234558', 'UPCE'],
  ])('accepts %s as %s', (value, format) => {
    const result = parsePayload(value, format);
    expect(result.type).toBe('product');
    expect(result.title).toBe('商品條碼');
    expect(result.fields).toEqual([{ label: 'GTIN', value }, { label: '類型', value: format }]);
    expect(result.actions).toEqual([{ kind: 'copy', label: '複製號碼', value }]);
  });
  it('rejects invalid check digits, lengths and other formats', () => {
    expect(parsePayload('4006381333932', 'EAN13').type).toBe('text');
    expect(parsePayload('01234559', 'UPCE').type).toBe('text');
    expect(parsePayload('4006381333931', 'Code128').type).toBe('text');
    expect(parsePayload('400638133393', 'EAN13').type).toBe('text');
  });
});

describe('robustness', () => {
  it('never throws on malformed input', () => {
    for (const value of ['WIFI:', 'WIFI:S:\\', 'mailto:', 'mailto:%E0%A4%A?subject=%', 'sms:', 'SMSTO:', 'geo:', 'BEGIN:VCARD', 'MECARD:', 'tel:%', 'https://']) {
      expect(() => parsePayload(value, 'QRCode')).not.toThrow();
      expect(opens(value).every(url => /^(https?|tel|mailto|sms):/.test(url))).toBe(true);
    }
    expect(parsePayload(undefined as unknown as string, undefined as unknown as string).type).toBe('text');
  });
});
