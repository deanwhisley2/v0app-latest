/**
 * App-wide UI strings by language code.
 * Add keys here, then use `useUserPreferences().t('key')` in client components.
 * Resolution order: overlay → English canonical pack → `common.missingTranslation` → humanized key.
 * **Never** put financial rules, amounts, or ledger logic in these strings — UI copy only.
 */

import type { AppLanguage } from "@/lib/user-preferences"
import { resolveUiString } from "@/lib/i18n/resolver"
import { fundingWithdrawalEn, fundingWithdrawalOverlays } from "@/lib/i18n/funding-withdrawal-copy"

/** Flat key → English source of truth */
const en: Record<string, string> = {
  "nav.trade": "Trade",
  "nav.container": "Container",
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
  "settings.item.region": "Operating country",
  "settings.regionTitle": "Operating country",
  "settings.regionHint":
    "Used for local funding corridors and regional defaults. Does not change ledger currency (USD-normalized internally).",
  "settings.regionApplySuggestion": "Apply suggested language & display currency",
  "settings.regionSaved": "Country saved for funding match.",
  "common.missingTranslation": "This label is not translated yet — switch to English or contact support.",
  ...fundingWithdrawalEn,
}

const fr: Partial<Record<string, string>> = {
  "nav.trade": "Trading",
  "nav.container": "Conteneur",
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
  "settings.item.region": "Pays d’opération",
  "settings.regionTitle": "Pays d’opération",
  "settings.regionHint":
    "Utilisé pour les corridors de financement et les valeurs par défaut régionales. La comptabilité interne reste en USD.",
  "settings.regionApplySuggestion": "Appliquer la langue et la devise suggérées",
  "settings.regionSaved": "Pays enregistré pour la correspondance de financement.",
  ...(fundingWithdrawalOverlays.fr ?? {}),
}

const sw: Partial<Record<string, string>> = {
  "nav.trade": "Biashara",
  "nav.container": "Chombo",
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
  "settings.item.region": "Nchi ya uendeshaji",
  "settings.regionTitle": "Nchi ya uendeshaji",
  "settings.regionHint":
    "Inatumika kwa njia za fedha za ndani na mapendekezo ya kikanda. Hesabu ya ndani bado iko kwa USD.",
  "settings.regionApplySuggestion": "Tumia lugha na sarafu zilizopendekezwa",
  "settings.regionSaved": "Nchi imehifadhiwa kwa ulinganifu wa fedha.",
  ...(fundingWithdrawalOverlays.sw ?? {}),
}

const ar: Partial<Record<string, string>> = {
  "nav.trade": "تداول",
  "nav.container": "الحاوية",
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
  "settings.item.region": "دولة التشغيل",
  "settings.regionTitle": "دولة التشغيل",
  "settings.regionHint":
    "تُستخدم لممرات التمويل المحلية والإعدادات الإقليمية. المحاسبة الداخلية تبقى بالدولار الأمريكي.",
  "settings.regionApplySuggestion": "تطبيق اللغة وعملة العرض المقترحة",
  "settings.regionSaved": "تم حفظ البلد لمطابقة التمويل.",
  ...(fundingWithdrawalOverlays.ar ?? {}),
}

const pt: Partial<Record<string, string>> = {
  "nav.trade": "Negociação",
  "nav.container": "Contentor",
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
  "nav.container": "Container",
  "nav.markets": "Kasuwa",
  "nav.wallet": "Jaka",
  "nav.settings": "Saituna",
  "bottom.send": "Aika",
  "header.searchHint": "Bincika",
  "settings.back": "Komawa zuwa saituna",
  "settings.languageTitle": "Harshe",
  "settings.item.region": "Ƙasar aiki",
  "settings.regionTitle": "Ƙasar aiki",
  "settings.regionHint": "Don hanyoyin biyan kuɗi na gida da saitunan yanki. Lissafi na ciki har yanzu USD ne.",
  "settings.regionApplySuggestion": "Yi amfani da harshe da kuɗin da aka ba da shawara",
  "settings.regionSaved": "An adana ƙasar don dacewa da biyan kuɗi.",
  ...(fundingWithdrawalOverlays.ha ?? {}),
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
  return resolveUiString(en, o, lang, key)
}
