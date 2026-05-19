import type { AppLanguage } from "@/lib/user-preferences"

export type AuthMessages = {
  login: {
    welcomeBack: string
    subtitle: string
    identifier: string
    identifierPlaceholder: string
    password: string
    rememberMe: string
    forgotPassword: string
    accessDashboard: string
    signingIn: string
    biometricSoon: string
    noAccount: string
    register: string
    home: string
    guestContinue: string
    guestHint: string
    orDivider: string
  }
  register: {
    title: string
    subtitle: string
    stepPersonal: string
    stepRegion: string
    stepSecurity: string
    next: string
    back: string
    submit: string
    submitting: string
    alreadyHave: string
    signIn: string
    home: string
    confirmPassword: string
    selfieLabel: string
    selfieHint: string
    selfieAdded: string
    referralHint: string
    countryHint: string
    countryRequired: string
    countryMismatch: string
    passwordStrength: string
    passwordWeak: string
    passwordFair: string
    passwordStrong: string
  }
  trust: {
    securePlatform: string
    encryptedSession: string
    liveMarkets: string
    institutionalGrade: string
  }
  footer: {
    terms: string
    privacy: string
    support: string
  }
}

const en: AuthMessages = {
  login: {
    welcomeBack: "Trade smarter with real-time crypto intelligence",
    subtitle:
      "Sign in to access your dashboard, charts, and automated strategies. New here? Create an account in seconds.",
    identifier: "Email, username, or phone",
    identifierPlaceholder: "you@example.com",
    password: "Password",
    rememberMe: "Remember me",
    forgotPassword: "Forgot password?",
    accessDashboard: "Access dashboard",
    signingIn: "Signing in…",
    biometricSoon: "Biometric sign-in (soon)",
    noAccount: "New to Nexus?",
    register: "Create account",
    home: "Home",
    guestContinue: "Continue as guest",
    guestHint: "Local preview only — not a registered account.",
    orDivider: "or",
  },
  register: {
    title: "Create your account",
    subtitle: "Guided onboarding — secure, simple, and built for mobile.",
    stepPersonal: "Personal",
    stepRegion: "Region",
    stepSecurity: "Security",
    next: "Continue",
    back: "Back",
    submit: "Create account",
    submitting: "Creating account…",
    alreadyHave: "Already have an account?",
    signIn: "Sign in",
    home: "Home",
    confirmPassword: "Confirm password",
    selfieLabel: "Security selfie (optional)",
    selfieHint: "Recommended for account recovery. Add now or later in Settings.",
    selfieAdded: "Face profile saved for secure recovery.",
    referralHint: "Paste a referral ID if someone invited you.",
    countryHint:
      "Must match where you are signing up from. VPN or foreign IPs are blocked at verification.",
    countryRequired: "Select your operating country to continue.",
    countryMismatch:
      "Your connection does not match the selected country. Choose your actual country or sign in from that region.",
    passwordStrength: "Password strength",
    passwordWeak: "Add more characters",
    passwordFair: "Fair — consider numbers & symbols",
    passwordStrong: "Strong password",
  },
  trust: {
    securePlatform: "Secure platform",
    encryptedSession: "Encrypted session",
    liveMarkets: "Live market data",
    institutionalGrade: "Institutional controls",
  },
  footer: {
    terms: "Terms",
    privacy: "Privacy",
    support: "Support",
  },
}

const overlays: Partial<Record<AppLanguage, DeepPartial<AuthMessages>>> = {
  fr: {
    login: {
      welcomeBack: "Tradez plus intelligemment avec l’intelligence crypto en temps réel",
      subtitle:
        "Connectez-vous pour accéder à votre tableau de bord, graphiques et stratégies automatisées. Nouveau ? Créez un compte en quelques secondes.",
      identifier: "E-mail, nom d’utilisateur ou téléphone",
      identifierPlaceholder: "vous@exemple.com",
      password: "Mot de passe",
      rememberMe: "Se souvenir de moi",
      forgotPassword: "Mot de passe oublié ?",
      accessDashboard: "Accéder au tableau de bord",
      signingIn: "Connexion…",
      biometricSoon: "Connexion biométrique (bientôt)",
      noAccount: "Nouveau sur Nexus ?",
      register: "Créer un compte",
      home: "Accueil",
      guestContinue: "Continuer en invité",
      guestHint: "Aperçu local uniquement — pas un compte enregistré.",
      orDivider: "ou",
    },
    register: {
      title: "Créer votre compte",
      subtitle: "Inscription guidée — simple, sécurisée et adaptée au mobile.",
      stepPersonal: "Identité",
      stepRegion: "Région",
      stepSecurity: "Sécurité",
      next: "Continuer",
      back: "Retour",
      submit: "Créer le compte",
      submitting: "Création du compte…",
      alreadyHave: "Vous avez déjà un compte ?",
      signIn: "Se connecter",
      home: "Accueil",
      confirmPassword: "Confirmer le mot de passe",
      selfieLabel: "Selfie de sécurité (facultatif)",
      selfieHint: "Recommandé pour la récupération de compte. Ajoutez maintenant ou plus tard dans Paramètres.",
      selfieAdded: "Profil facial enregistré pour une récupération sécurisée.",
      referralHint: "Collez un code de parrainage si quelqu’un vous a invité.",
      countryHint:
        "Doit correspondre à votre pays d’inscription. VPN ou IP étrangères sont bloquées à la vérification.",
      countryRequired: "Sélectionnez votre pays d’opération pour continuer.",
      countryMismatch:
        "Votre connexion ne correspond pas au pays sélectionné. Choisissez votre pays réel ou connectez-vous depuis cette région.",
      passwordStrength: "Force du mot de passe",
      passwordWeak: "Ajoutez plus de caractères",
      passwordFair: "Correct — ajoutez chiffres et symboles",
      passwordStrong: "Mot de passe fort",
    },
    trust: {
      securePlatform: "Plateforme sécurisée",
      encryptedSession: "Session chiffrée",
      liveMarkets: "Marchés en direct",
      institutionalGrade: "Contrôles institutionnels",
    },
    footer: {
      terms: "Conditions",
      privacy: "Confidentialité",
      support: "Assistance",
    },
  },
  ar: {
    login: {
      welcomeBack: "مرحباً بعودتك",
      subtitle: "سجّل الدخول إلى منصة التداول المؤسسية.",
      accessDashboard: "الدخول إلى لوحة التحكم",
      signingIn: "جارٍ تسجيل الدخول…",
    },
    register: {
      title: "إنشاء حسابك",
      subtitle: "تسجيل موجّه — آمن وبسيط للجوال.",
      stepPersonal: "البيانات",
      stepRegion: "المنطقة",
      stepSecurity: "الأمان",
      next: "متابعة",
      back: "رجوع",
    },
  },
  sw: {
    login: {
      welcomeBack: "Karibu tena",
      subtitle: "Ingia kwenye jukwaa lako la biashara la kitaasisi.",
      accessDashboard: "Fungua dashibodi",
      signingIn: "Inaingia…",
    },
    register: {
      title: "Fungua akaunti yako",
      subtitle: "Usajili unaongozwa — salama na rahisi kwenye simu.",
      stepPersonal: "Taarifa",
      stepRegion: "Eneo",
      stepSecurity: "Usalama",
      next: "Endelea",
      back: "Rudi",
    },
  },
  ha: {
    login: {
      welcomeBack: "Barka da dawowa",
      subtitle: "Shiga cikin dandali na kasuwancin kwararru.",
      accessDashboard: "Shiga dashboard",
      signingIn: "Ana shiga…",
    },
    register: {
      title: "Ƙirƙiri asusunka",
      subtitle: "Shiryawa mai jagora — aminci da sauƙi a wayar hannu.",
      stepPersonal: "Bayani",
      stepRegion: "Yanki",
      stepSecurity: "Tsaro",
      next: "Ci gaba",
      back: "Koma",
    },
  },
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

function mergeAuth(base: AuthMessages, patch?: DeepPartial<AuthMessages>): AuthMessages {
  if (!patch) return base
  return {
    login: { ...base.login, ...patch.login },
    register: { ...base.register, ...patch.register },
    trust: { ...base.trust, ...patch.trust },
    footer: { ...base.footer, ...patch.footer },
  }
}

export function getAuthMessages(lang: AppLanguage): AuthMessages {
  return mergeAuth(en, overlays[lang])
}

export function isRtlAuthLanguage(lang: AppLanguage): boolean {
  return lang === "ar"
}
