# NEXUS PRO — Terms, Privacy & Support (filled draft)

**Purpose:** Draft for your counsel to review. Filled placeholders use information from the product codebase (e.g. Supabase, Brevo email) and details you supplied (Roger Schelman, NEXUS CRYPTO INTELLIGENCE, esknexuspro@gmail.com, nexuspro.it.com). **Replace bracketed items** that still need a street address, final entity name, or jurisdiction.

---

# Terms of Service

**Effective Date: May 3, 2026 | Version: 1.0**

Welcome to NEXUS PRO (“Platform”, “we”, “us”, or “our”). NEXUS PRO is a web-based cryptocurrency trading and intelligence application operated by **NEXUS CRYPTO INTELLIGENCE**, a company with principal contact address in **Los Angeles, California, United States** *(insert full registered legal address on company letterhead)* (“Company”).

By accessing or using the Platform (including registration, login, or guest browsing where enabled), you (“User”, “you”) agree to these Terms of Service (“Terms”). If you do not agree, do not use the Platform.

## 1. Description of Services

NEXUS PRO provides real-time crypto market charts, intelligence, analysis overlays, research tools (e.g., comparisons, workspace pages), notifications, and an in-app assistant (“Joelin” or “Nexus Assistant”).

**Core Features** (as enabled in your deployment):

- **Accounts**: Registration, login, email verification (including codes sent via transactional email), and optional **guest / browse-without-account** access when not disabled by configuration.
- **Markets & Trading Workflows**: Live charts and server-side data routes. Optional integration with **third-party exchanges** (the Platform includes support for connectivity such as **Binance** and **Bitget**, among others) for viewing balances or executing trades via **user-provided API keys or linked exchange accounts**. **The Platform does not custody user funds**; assets remain with you and with third-party exchanges per their terms.
- **Automation & Bots**: User-facing signals, strategies, and automated trading tools (where enabled). Internal strategy logic is **proprietary** and may not be exposed or reverse-engineered.
- **Wallet / Funding UX**: The interface may present deposits, withdrawals, and balances in connection with **linked exchanges**. Settlement, custody, and regulatory treatment are determined by **those exchanges**, not by the Platform as custodian.
- **Assistant**: Product and trust guidance only; not financial, legal, or tax advice.
- **Notifications**: In-app notifications; related preferences may be stored locally and/or with your account data depending on implementation.

## 2. User Eligibility & Accounts

- You must be **18 or older** (or the age of majority in your jurisdiction) and must not use the Platform from **prohibited or sanctioned jurisdictions** or if you are a prohibited person. **[Your counsel to publish and maintain a definitive restricted-country list or link.]**
- You are responsible for safeguarding your account, passwords, **API keys**, and all activity under your credentials.
- We may suspend or terminate accounts that violate these Terms or pose security or legal risk.

## 3. User Responsibilities

- **API keys / credentials**: You authorize the Platform to use keys you supply solely to provide the service. Store secrets securely; **rotate keys** after any suspected compromise and notify us promptly. You bear risks arising from key leakage, misconfiguration, or exchange-side actions.
- **Compliance**: Use the Platform only for lawful purposes and in compliance with applicable laws, exchange rules, and sanctions.
- **Prohibited conduct**: No unlawful use, no attempt to extract or reverse-engineer proprietary models or non-public logic, and no abusive scraping or circumvention of technical limits (subject to fair use for personal research as your counsel defines).

## 4. Risks & Disclaimers

**NOT FINANCIAL ADVICE**: Charts, signals, strategies, analysis overlays, automation, notifications, and Joelin / Nexus Assistant content are **informational tools only** and not personalized investment, legal, or tax advice. Consult qualified professionals.

**Trading & crypto risks**: Digital assets are volatile; you may lose your entire principal. Third-party exchanges may experience outages, delays, insolvency, security incidents, or regulatory restrictions beyond our control.

**Automation / bots**: **No profit guarantee.** Bugs, latency, partial fills, and market conditions can cause unexpected outcomes. Use simulation or small size where available; use exchange-side limits and controls.

**No warranties**: The Platform is provided **“as is”** and **“as available”** to the fullest extent permitted by law.

## 5. Fees

**[Counsel to confirm:]** Platform access may be free or fee-based per your published pricing. **Third-party exchanges, networks, and banks** may charge separate fees. Material fee changes should be communicated as required by law and your pricing policy.

## 6. Termination

We may suspend or terminate access for breach, risk, or legal reasons. You may stop using the Platform at any time. Provisions that reasonably should survive (e.g., disclaimers, liability limits, governing law) survive termination.

## 7. Limitation of Liability

To the **maximum extent permitted by applicable law**, Company is not liable for **indirect, incidental, special, consequential, or punitive damages** (including lost profits or data) arising from use of the Platform, exchanges, or third-party services. **[Counsel to set a cap consistent with jurisdiction, e.g., greater of fees paid in the prior 12 months or a fixed sum.]** Some jurisdictions do not allow certain limitations; in those cases limits apply only to the extent permitted.

## 8. Governing Law

**[Counsel to specify, e.g., laws of the State of California, USA, excluding conflict-of-law rules, and exclusive venue in courts of Los Angeles County, California]** — replace with your chosen jurisdiction and dispute forum (including arbitration clause if used).

## 9. Changes

We may update these Terms. We will provide notice as required by law (e.g., posting on the Platform or email to your registered address). Continued use after the effective date may constitute acceptance where permitted.

## 10. Contact

For support and legal notices, use the **Support & Contact** section at the end of this document (email and website).

**About us (short):** NEXUS PRO is a web platform that combines real-time crypto market charts and data with optional exchange connectivity and automation tools, designed for traders who want a centralized dashboard to monitor markets, manage alerts, and (where supported) execute or assist trades through linked exchange accounts.

By using NEXUS PRO, you acknowledge that you have read and agree to these Terms.

Sincerely,

**Roger Schelman**  
Director, **NEXUS CRYPTO INTELLIGENCE**  
[esknexuspro@gmail.com](mailto:esknexuspro@gmail.com) | [https://nexuspro.it.com](https://nexuspro.it.com)

---

# Privacy Policy

**Effective Date: May 3, 2026 | Version: 1.0**

**NEXUS CRYPTO INTELLIGENCE** (“we”, “us”, “our”) respects your privacy. This Privacy Policy describes how we collect, use, store, and share information when you use **NEXUS PRO** (the “Platform”).

**Data controller:** **NEXUS CRYPTO INTELLIGENCE**, **Los Angeles, California, United States** *(insert full registered address)*. **[If required: Data Protection Officer name and email. EU representative, if applicable.]**

## 1. Data we collect

**Account & identity**

- **Registration / auth**: Email address, authentication tokens, and profile fields you provide (e.g., display name) via **Supabase** (or successor) authentication and database services.
- **Verification**: One-time or short-lived codes sent to your email for sign-up / login verification.

**Technical & usage**

- IP address, device and browser type, timestamps, and application logs as needed for **security, debugging, and service operation**.
- In-app activity that your deployment logs (e.g., feature usage, errors) — **align this list with your actual logging policy.**

**Sensitive / high-risk**

- **Exchange API keys and related credentials** that you submit so the Platform can call exchange APIs on your behalf. These must be **protected in transit (TLS)** and **at rest** per your security architecture (e.g., encrypted storage in Supabase or a dedicated secrets system). **Describe the exact approach after a security review.**

**From integrations**

- **Exchange-derived data** (e.g., balances, orders) retrieved when you connect keys or accounts; typically **transient** for display and automation, but **retention** must match your database schema (e.g., trade logs if you persist `bot_trade_records` or similar tables).

**Assistant (Joelin / Nexus Assistant)**

- If **DeepSeek** (or other LLM providers) is enabled server-side, prompts/responses may be processed by that provider under their terms — **list the provider and link to their privacy policy** when enabled.

**We do not custody blockchain private keys as a wallet provider** in the sense of a self-custody wallet app; exchange custody remains with third parties.

We do not intentionally collect **precise geolocation** unless you later add an explicit opt-in feature.

## 2. How we use data

- Operate accounts, charts, notifications, exchange connectivity, and optional automation.
- **Security and fraud prevention**, abuse detection, and legal compliance.
- **Product improvement** (including diagnostics and aggregated analytics if you use them — **disclose vendors**).
- **Communications**: service emails (e.g., verification via **Brevo** transactional email from `security@nexuspro.it.com`, Reply-To `support@nexuspro.it.com`), support responses, and legally required notices.

## 3. Sharing & processors

We use service providers (“processors”) to run the Platform, including:

- **Supabase** — authentication, database, and related infrastructure *(region: per your Supabase project settings; link: [https://supabase.com/privacy](https://supabase.com/privacy))*.
- **Brevo** — transactional email delivery *(link: [https://www.brevo.com/](https://www.brevo.com/))*.
- **Hosting / deployment** — e.g. VPS with nginx + PM2, or other servers **as actually used**; list the provider and subprocessors.
- **Optional AI** — **DeepSeek** (Joelin) when `DEEPSEEK_API_KEY` is configured; otherwise assistant replies may be local-only.

**Exchanges**: When you connect keys, requests go to **Binance, Bitget, KuCoin**, or other exchanges you enable; their privacy policies govern their processing.

We **do not sell** your personal information. We do not share for **cross-context behavioral advertising** unless you add such a program and comply with opt-out laws.

**International transfers**: Data may be processed in the **United States** and other regions where our processors operate. For **UK/EU users**, describe **Standard Contractual Clauses** or other mechanisms your counsel approves.

## 4. Storage & retention

- Industry-standard safeguards: **encryption in transit**; **encryption at rest** where supported by processors and your configuration.
- **Retention**: Accounts until deletion; security logs **[e.g., 90 days — set actual policy]**; exchange API keys **deleted on disconnect, account deletion, or termination** unless law requires retention.
- **Backups**: describe if backups retain deleted data and for how long.

## 5. Your rights

Depending on your location, you may have rights to **access, rectify, delete, export, restrict, or object** to certain processing, and to **withdraw consent** where processing is consent-based.

**Requests:** Contact **[esknexuspro@gmail.com](mailto:esknexuspro@gmail.com)**. We will respond within a reasonable period as required by law (e.g., GDPR/UK GDPR/CPRA timelines after verification).

## 6. Cookies & similar technologies

We use cookies and local storage as needed for **session / authentication** and preferences. **[If you add Google Analytics or ads, list them and provide opt-out instructions.]**

## 7. Children

The Platform is **not directed to children under 13** (or **16** where a higher age applies). We do not knowingly collect personal information from children.

## 8. Changes

We may update this Privacy Policy. We will post the new version and update the effective date, and provide additional notice where required.

## 9. Contact

See **Support & Contact** below.

**Legal bases (EU/UK):** *[Counsel to add table: contract, legitimate interests, consent, legal obligation.]*

---

# Support & Contact

**Need help?** We will assist with account access, exchange connectivity, and Platform behavior as described in our documentation and these policies.

## Contact details

| Channel | Detail |
|--------|--------|
| **General support** | [esknexuspro@gmail.com](mailto:esknexuspro@gmail.com) |
| **Website** | [https://nexuspro.it.com](https://nexuspro.it.com) |
| **Ticket system** | **[If you add Zendesk / Freshdesk / etc., URL here]** — *none configured in codebase.* |
| **Typical response time** | **24–48 business hours** *(set SLA you can meet)* |
| **Phone** | **[Optional — add if published]** |

## Common topics

- Account access, registration, and email verification
- Exchange connections and API keys (Binance, Bitget, KuCoin, etc., per your deployment)
- Charts, live analysis, notifications, and dashboard features
- Automated trading / bot behavior (product support only — **not** investment advice)
- Bug reports and feature requests

## Security

If you believe credentials are compromised or you discovered a vulnerability, email **[esknexuspro@gmail.com](mailto:esknexuspro@gmail.com)** with subject **“Security”** and **[add dedicated security@ address on your domain if you create one]**. Rotate exchange API keys immediately via the exchange’s console.

## FAQ

**How do I connect an exchange?** Use the dashboard **Settings** (e.g., connected exchanges / security) and follow the exchange’s instructions for API keys. **Read-only keys** are recommended where the Platform supports read-only balance views.

**Where are Terms and Privacy?** Published alongside this document for your site; link them from **Settings → About** in the app.

---

**Company footer**

**NEXUS CRYPTO INTELLIGENCE**  
Los Angeles, California, United States *(complete registered address)*  
[https://nexuspro.it.com](https://nexuspro.it.com)  
*Product referenced as NEXUS PRO.*

---

## Checklist for you before publication

1. Insert **full registered street address** and confirm **exact legal entity name** on formation documents.  
2. Have counsel finalize **restricted jurisdictions**, **governing law**, **arbitration vs courts**, and **liability cap**.  
3. Confirm whether **DeepSeek / xAI / other APIs** are on in production; update Section 1–3 of Privacy accordingly.  
4. List **actual hosting provider** (domain, VPS, analytics vendor if any).  
5. Wire in-app **Terms**, **Privacy**, and **Contact** buttons to these URLs or pages.
