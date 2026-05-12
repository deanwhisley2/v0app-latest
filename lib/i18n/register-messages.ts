import type { AppLanguage } from "@/lib/user-preferences"

type Reg = {
  title: string
  subtitle: string
  fullName: string
  phone: string
  email: string
  password: string
  passwordHint: string
  language: string
  currency: string
  /** Operating country (ISO2) — optional at signup */
  operatingCountry?: string
  /** Optional referrer code from link or pasted id */
  referralCodeOptional?: string
  /** Cloudflare Turnstile (human verification) */
  captchaLabel: string
  captchaHint: string
  captchaRequired: string
  /** When server secret is unset (local dev only) */
  captchaDevSkip: string
  submit: string
  submitting: string
  signInLink: string
  homeLink: string
}

const register: Record<AppLanguage, Reg> = {
  en: {
    title: "Create account",
    subtitle: "Sign up with your details.",
    fullName: "Full name",
    phone: "Phone",
    email: "Email",
    password: "Password",
    passwordHint: "At least 6 characters (use a strong password).",
    language: "Language",
    currency: "Display currency",
    operatingCountry: "Operating country (optional)",
    referralCodeOptional: "Referral ID (optional)",
    captchaLabel: "Human verification",
    captchaHint: "Complete the check below. It helps prevent bots and fake signups.",
    captchaRequired: "Please complete the security verification before registering.",
    captchaDevSkip: "Security check is skipped on the server in local development when Turnstile keys are unset.",
    submit: "Register",
    submitting: "Creating account…",
    signInLink: "Sign in",
    homeLink: "Home",
  },
  sw: {
    title: "Fungua akaunti",
    subtitle: "Jisajili kwa taarifa zako.",
    fullName: "Jina kamili",
    phone: "Simu",
    email: "Barua pepe",
    password: "Nenosiri",
    passwordHint: "Angalau herufi 6 (tumia nenosiri imara).",
    language: "Lugha",
    currency: "Sarafu ya kuonyesha salio",
    captchaLabel: "Uthibitisho wa mtu",
    captchaHint: "Kamilisha hatua hapa chini. Inasaidia kuzuia roboti na akaunti bandia.",
    captchaRequired: "Tafadhali kamilisha uthibitisho wa usalama kabla ya kujisajili.",
    captchaDevSkip: "Uthibitisho una ruka kwenye seva katika maendeleo ya ndani ikiwa funguo hazipo.",
    submit: "Jisajili",
    submitting: "Inaunda akaunti…",
    signInLink: "Ingia",
    homeLink: "Mwanzo",
  },
  fr: {
    title: "Créer un compte",
    subtitle: "Inscrivez-vous avec vos informations.",
    fullName: "Nom complet",
    phone: "Téléphone",
    email: "E-mail",
    password: "Mot de passe",
    passwordHint: "Au moins 6 caractères (mot de passe fort).",
    language: "Langue",
    currency: "Devise d’affichage",
    captchaLabel: "Vérification humaine",
    captchaHint: "Complétez la vérification ci-dessous. Elle limite les robots et faux comptes.",
    captchaRequired: "Veuillez terminer la vérification de sécurité avant de vous inscrire.",
    captchaDevSkip: "La vérification est ignorée côté serveur en développement local si les clés Turnstile sont absentes.",
    submit: "S’inscrire",
    submitting: "Création du compte…",
    signInLink: "Connexion",
    homeLink: "Accueil",
  },
  ar: {
    title: "إنشاء حساب",
    subtitle: "سجّل بياناتك.",
    fullName: "الاسم الكامل",
    phone: "الهاتف",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    passwordHint: "6 أحرف على الأقل (استخدم كلمة مرور قوية).",
    language: "اللغة",
    currency: "عملة العرض",
    captchaLabel: "التحقق البشري",
    captchaHint: "أكمل التحقق أدناه. يحدّ من الحسابات الآلية والوهمية.",
    captchaRequired: "يُرجى إكمال التحقق الأمني قبل التسجيل.",
    captchaDevSkip: "يُتخطى التحقق على الخادم في بيئة التطوير المحلية عند عدم ضبط مفاتيح Turnstile.",
    submit: "تسجيل",
    submitting: "جارٍ إنشاء الحساب…",
    signInLink: "تسجيل الدخول",
    homeLink: "الرئيسية",
  },
  pt: {
    title: "Criar conta",
    subtitle: "Registe-se com os seus dados.",
    fullName: "Nome completo",
    phone: "Telefone",
    email: "E-mail",
    password: "Palavra-passe",
    passwordHint: "Pelo menos 6 caracteres (palavra-passe forte).",
    language: "Idioma",
    currency: "Moeda de visualização",
    captchaLabel: "Human verification",
    captchaHint: "Complete the check below. It helps prevent bots and fake signups.",
    captchaRequired: "Please complete the security verification before registering.",
    captchaDevSkip: "Security check is skipped on the server in local development when Turnstile keys are unset.",
    submit: "Registar",
    submitting: "A criar conta…",
    signInLink: "Entrar",
    homeLink: "Início",
  },
  ha: {
    title: "Ƙirƙiri asusu",
    subtitle: "Yi rijista da bayananka.",
    fullName: "Cikakken suna",
    phone: "Waya",
    email: "Imel",
    password: "Kalmar sirri",
    passwordHint: "Aƙalla haruffa 6 (yi amfani da kalmar sirri mai ƙarfi).",
    language: "Harshe",
    currency: "Kudin nuni",
    captchaLabel: "Tabbatar da mutum",
    captchaHint: "Kammala binciken nan. Yana taimakawa wajen hana robobi da rijistar bogi.",
    captchaRequired: "Da fatan za a kammala tabbatar da tsaro kafin rijista.",
    captchaDevSkip: "An tsallake tabbatarwa akan sabar a cikin gida idan ba a sa makullan Turnstile ba.",
    submit: "Rijista",
    submitting: "Ana ƙirƙirar asusu…",
    signInLink: "Shiga",
    homeLink: "Gida",
  },
  am: {
    title: "መለያ ፍጠር",
    subtitle: "በዝርዝርዎ ይመዝገቡ።",
    fullName: "ሙሉ ስም",
    phone: "ስልክ",
    email: "ኢሜይል",
    password: "የይለፍ ቃል",
    passwordHint: "ቢያንስ 6 ቁምፊዎች (ጠንካራ የይለፍ ቃል ይጠቀሙ)።",
    language: "ቋንቋ",
    currency: "የማሳያ ምንዛሬ",
    captchaLabel: "Human verification",
    captchaHint: "Complete the check below. It helps prevent bots and fake signups.",
    captchaRequired: "Please complete the security verification before registering.",
    captchaDevSkip: "Security check is skipped on the server in local development when Turnstile keys are unset.",
    submit: "መዝገብ",
    submitting: "መለያ በመፍጠር ላይ…",
    signInLink: "ግባ",
    homeLink: "መነሻ",
  },
  zu: {
    title: "Dala i-akhawunti",
    subtitle: "Bhalisa ngezincazelo zakho.",
    fullName: "Igama eliphelele",
    phone: "Ifoni",
    email: "I-imeyili",
    password: "Iphasiwedi",
    passwordHint: "Okungenani izinhlamvu eziyi-6 (sebenzisa iphasiwedi eqinile).",
    language: "Ulimi",
    currency: "Imali yokubuka",
    captchaLabel: "Human verification",
    captchaHint: "Complete the check below. It helps prevent bots and fake signups.",
    captchaRequired: "Please complete the security verification before registering.",
    captchaDevSkip: "Security check is skipped on the server in local development when Turnstile keys are unset.",
    submit: "Bhalisa",
    submitting: "Kudala i-akhawunti…",
    signInLink: "Ngena",
    homeLink: "Ikhaya",
  },
  wo: {
    title: "Sos compte",
    subtitle: "Bindu ci say xibaar yi.",
    fullName: "Tur bu bu bees",
    phone: "Téléfon",
    email: "Imeel",
    password: "Baatu-jàll",
    passwordHint: "6 araf minimum (jëfandikoo baatu-jàll bu am doole).",
    language: "Làkk",
    currency: "Ortu na wone xaalis",
    captchaLabel: "Human verification",
    captchaHint: "Complete the check below. It helps prevent bots and fake signups.",
    captchaRequired: "Please complete the security verification before registering.",
    captchaDevSkip: "Security check is skipped on the server in local development when Turnstile keys are unset.",
    submit: "Bindu",
    submitting: "Compte bi di sos…",
    signInLink: "Dugg",
    homeLink: "Alal",
  },
}

export function getRegisterMessages(lang: AppLanguage): Reg {
  const loc = register[lang] ?? register.en
  return {
    ...register.en,
    ...loc,
    referralCodeOptional: loc.referralCodeOptional ?? register.en.referralCodeOptional,
  }
}
