import en from './en.json';
import es from './es.json';
import zh from './zh.json';
import arn from './arn.json';

export const defaultLang = 'es';
export const languagesList = ['es', 'en', 'zh', 'arn'] as const;

export const languages: Record<string, string> = {
  es: 'Español',
  en: 'English',
  zh: '中文',
  arn: 'Mapudungun',
};

const ui: Record<string, any> = { en, es, zh, arn };

export function getLangFromUrl(url: URL): string {
  const seg = url.pathname.split('/').filter(Boolean);
  const lang = seg[0];
  return (languagesList as readonly string[]).includes(lang) ? lang : defaultLang;
}

export function getI18n(url: URL) {
  const lang = getLangFromUrl(url);
  const messages = ui[lang];
  const t = (key: string): string => {
    const found = key
      .split('.')
      .reduce<any>((o, i) => (o == null ? undefined : o[i]), messages);
    return found ?? '';
  };
  return { lang, messages, t };
}

export function buildAlternates(path = ''): Record<string, string> {
  const base = 'https://farodelaserena.com';
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const mk = (l: string) => `${base}/${l}${clean ? '/' + clean : ''}`;
  return {
    es: mk('es'),
    en: mk('en'),
    zh: mk('zh'),
    arn: mk('arn'),
    xDefault: mk('es'),
  };
}

export function htmlLangAttr(lang: string): string {
  return lang === 'zh' ? 'zh-CN' : lang;
}
