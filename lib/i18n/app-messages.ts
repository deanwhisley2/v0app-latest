/**
 * App-wide UI strings by language code.
 * Add keys here, then use `useUserPreferences().t('key')` in client components.
 * Missing keys fall back to English; unknown languages fall back to English pack.
 */

import type { AppLanguage } from "@/lib/user-preferences"

/** Flat key → English source of truth */
const en: Record<string, string> = {
  "nav.trade": "Trade",
  "nav.markets": "Markets",
  "nav.wallstreet": "Wallstreet",
  "nav.wallet": "Wallet",
  "nav.settings": "Settings",

  "bottom.assistantTitle": "Joelin",
  "bottom.assistantSubtitle": "Quick help",
  "bottom.assistantWelcome": "How can we help today?",
  "bottom.askPlaceholder": "Ask something…",
  "bottom.send": "Send",

  "header.searchHint": "Search",
  "header.cantFind": "Can't find it?",

  "settings.back": "Back to settings",
  "settings.languageTitle": "Language",
  "settings.languageHint":
    "Applies across the app after reload on some screens; more labels are added to the dictionary over time.",

  "settings.currencyTitle": "Display currency",
  "settings.item.language": "Language",
  "settings.item.currency": "Display currency",
}

const fr: Partial<Record<string, string>> = {
  "nav.trade": "Trading",
  "nav.markets": "Marchés",
  "nav.wallstreet": "Wall Street",
  "nav.wallet": "Portefeuille",
  "nav.settings": "Paramètres",
  "bottom.assistantTitle": "Joelin",
  "bottom.assistantSubtitle": "Aide rapide",
  "bottom.assistantWelcome": "Comment pouvons-nous aider ?",
  "bottom.askPlaceholder": "Posez une question…",
  "bottom.send": "Envoyer",
  "header.searchHint": "Recherche",
  "header.cantFind": "Vous ne trouvez pas ?",
  "settings.back": "Retour aux paramètres",
  "settings.languageTitle": "Langue",
  "settings.languageHint":
    "S’applique à l’application ; d’autres textes seront ajoutés au dictionnaire progressivement.",
  "settings.currencyTitle": "Devise d’affichage",
  "settings.item.language": "Langue",
  "settings.item.currency": "Devise d’affichage",
}

const sw: Partial<Record<string, string>> = {
  "nav.trade": "Biashara",
  "nav.markets": "Masoko",
  "nav.wallstreet": "Wallstreet",
  "nav.wallet": "Pochi",
  "nav.settings": "Mipangilio",
  "bottom.assistantTitle": "Joelin",
  "bottom.assistantSubtitle": "Msaada wa haraka",
  "bottom.assistantWelcome": "Tunaweza kukusaidia vipi leo?",
  "bottom.askPlaceholder": "Uliza kitu…",
  "bottom.send": "Tuma",
  "header.searchHint": "Tafuta",
  "header.cantFind": "Huioni?",
  "settings.back": "Rudi kwenye mipangilio",
  "settings.languageTitle": "Lugha",
  "settings.languageHint":
    "Inatumika katika programu; maandishi mengine yataongezwa pole pole kwenye kamusi.",
  "settings.currencyTitle": "Sarafu ya kuonyesha",
  "settings.item.language": "Lugha",
  "settings.item.currency": "Sarafu ya kuonyesha",
}

const ar: Partial<Record<string, string>> = {
  "nav.trade": "تداول",
  "nav.markets": "الأسواق",
  "nav.wallstreet": "وول ستريت",
  "nav.wallet": "المحفظة",
  "nav.settings": "الإعدادات",
  "bottom.assistantTitle": "Joelin",
  "bottom.assistantSubtitle": "مساعدة سريعة",
  "bottom.assistantWelcome": "كيف يمكننا المساعدة اليوم؟",
  "bottom.askPlaceholder": "اطرح سؤالاً…",
  "bottom.send": "إرسال",
  "header.searchHint": "بحث",
  "header.cantFind": "لا تجد؟",
  "settings.back": "العودة إلى الإعدادات",
  "settings.languageTitle": "اللغة",
  "settings.languageHint": "تُطبَّق على التطبيق؛ تُضاف المزيد من النصوص إلى القاموس تدريجياً.",
  "settings.currencyTitle": "عملة العرض",
  "settings.item.language": "اللغة",
  "settings.item.currency": "عملة العرض",
}

const pt: Partial<Record<string, string>> = {
  "nav.trade": "Negociação",
  "nav.markets": "Mercados",
  "nav.wallstreet": "Wall Street",
  "nav.wallet": "Carteira",
  "nav.settings": "Definições",
  "bottom.send": "Enviar",
  "header.searchHint": "Pesquisar",
  "settings.back": "Voltar às definições",
  "settings.languageTitle": "Idioma",
  "settings.item.language": "Idioma",
  "settings.item.currency": "Moeda de visualização",
}

const ha: Partial<Record<string, string>> = {
  "nav.trade": "Kasuwanci",
  "nav.markets": "Kasuwa",
  "nav.wallet": "Jaka",
  "nav.settings": "Saituna",
  "bottom.send": "Aika",
  "header.searchHint": "Bincika",
  "settings.back": "Komawa zuwa saituna",
  "settings.languageTitle": "Harshe",
}

const am: Partial<Record<string, string>> = {
  "nav.trade": "ንግድ",
  "nav.markets": "ገበያዎች",
  "nav.wallet": "ቦርሳ",
  "nav.settings": "ቅንብሮች",
  "bottom.send": "ላክ",
  "header.searchHint": "ፈልግ",
  "settings.back": "ወደ ቅንብሮች ተመለስ",
  "settings.languageTitle": "ቋንቋ",
}

const zu: Partial<Record<string, string>> = {
  "nav.trade": "Ukuthengisa",
  "nav.markets": "Izimakethe",
  "nav.wallet": "Isikhwama semali",
  "nav.settings": "Izilungiselelo",
  "bottom.send": "Thumela",
  "header.searchHint": "Sesha",
  "settings.back": "Buyela ezilungiselelweni",
  "settings.languageTitle": "Ulimi",
}

const wo: Partial<Record<string, string>> = {
  "nav.trade": "Njëlbëri",
  "nav.wallet": "Portu",
  "nav.settings": "Tànneef",
  "bottom.send": "Yónnee",
  "header.searchHint": "Seet",
  "settings.back": "Dellu ci tànneef yi",
  "settings.languageTitle": "Làkk",
}

const overlays: Record<AppLanguage, Partial<Record<string, string>> | undefined> = {
  en: undefined,
  fr,
  sw,
  ar,
  pt,
  ha,
  am,
  zu,
  wo,
}

export function translateApp(lang: AppLanguage, key: string): string {
  const o = overlays[lang]
  if (o && o[key] != null) return o[key]!
  return en[key] ?? key
}
