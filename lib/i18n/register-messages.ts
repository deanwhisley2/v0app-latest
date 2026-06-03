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
    submit: "Register",
    submitting: "Creating account…",
    signInLink: "Sign in",
    homeLink: "Home",
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
    submit: "S’inscrire",
    submitting: "Création du compte…",
    signInLink: "Connexion",
    homeLink: "Accueil",
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
