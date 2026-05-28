import Link from "next/link"

export const metadata = {
  title: "Service Agreement | NEXUS PRO",
  description: "NEXUS PRO service agreement",
}

const SERVICE_AGREEMENT_TEXT = `Service Agreement
Last Updated: 2023/05/26 23:35:43
The Site is a platform for users to trade digital assets and provide related services (the "Service" or "Services"). For the convenience of this Agreement, the Site is collectively referred to in this Agreement as "we" or other first-person designations. As long as the natural person or other subject who accesses the Site is a user of the Site, for the convenience of this Agreement, "you" or other second person is used below. For purposes of this Agreement, we and you are collectively referred to in this Agreement as the "Parties" and we or you are referred to solely as a "Party".
Important Notice.
We hereby specifically remind you that:

Digital Assets are not themselves issued by any financial institution or company or by the Site.
The market for digital assets is new and unidentified and may not grow.
Digital assets are used heavily primarily by speculators, with relatively little use in the retail and commercial markets, and that trading in digital assets carries an extremely high level of risk, with round-the-clock trading, no limits on gains or losses, and prices that are susceptible to significant fluctuations due to the influence of market makers, and global government policies.
If the Company unilaterally determines that you have violated this Agreement, or that the services provided by this Website or your use of the services provided by this Website are illegal under the laws of your jurisdiction, the Company has the right to suspend or terminate your account at any time, or suspend or terminate your use of the services or digital asset transactions provided by this Website.

Anyone from [Mainland China, Taiwan, Hong Kong, Thailand, North Korea, South Korea, Ukraine (retail users)] is prohibited from using the contract trading services provided by this Website. The aforementioned list of countries or regions will change with the policies and product types of different countries or regions. We may not specifically notify you at that time. Please pay attention to updates to this Agreement in a timely manner.
Trading in digital assets carries a high degree of risk and is not suitable for the vast majority of people. You understand and appreciate that this transaction may result in partial or total loss and that you should determine the amount of the transaction based on the amount of loss you can afford. You understand and appreciate that there are derivative risks associated with digital assets, so if you have any questions, you are advised to seek the assistance of a professional advisor first. In addition, in addition to the risks mentioned above, there are unpredictable risks. You should make any decision to buy or sell digital assets based on a careful consideration and clear judgment in assessing your financial situation and the risks described above, and you assume full responsibility for any resulting losses, for which we are not liable.
You are advised that:

You understand that this website only serves as a place for you to obtain information about digital assets, find counterparties, negotiate and conduct transactions regarding digital assets, and that this website is not involved in any of your transactions, so you should exercise your own discretion in determining the authenticity, legality and validity of the relevant digital assets and/or information, and bear the responsibility and losses arising therefrom.
Any opinions, news, discussions, analysis, prices, recommendations and other information on this website are general market commentary and do not constitute investment advice. We shall not be liable for any loss arising directly or indirectly from reliance on such information, including but not limited to any loss of profits.
We have taken reasonable steps to ensure the accuracy of the information on this website, but do not guarantee its accuracy and will not be liable for any loss arising directly or indirectly from the information on this website or from any delay or failure in linking to the internet, transmitting or receiving any notices and information.
The use of Internet-based trading systems is subject to risks, including but not limited to, software, hardware and Internet connection failures. As we have no control over the reliability and availability of the Internet, we cannot be held liable for distortions, delays and connection failures.
Prohibit the use of this website to engage in money laundering, smuggling, commercial bribery and other illegal trading activities or illegal acts. If any suspected illegal trading or illegal acts are found, this website will take all available means, including but not limited to freezing the account, informing the relevant authorities, etc. We do not assume all responsibilities arising from this and reserve the right to pursue responsibilities from the relevant parties.
Prohibit the use of this site for malicious market manipulation, improper trading and all other unethical trading activities. If such events are found, this site will take preventive protection measures such as warning, restricting trading, closing accounts and other unethical behavior. We do not assume all the responsibilities arising from this and reserve the right to pursue responsibilities from the relevant parties.

[Continue with the full remaining text you previously provided — from "I. General Provisions" all the way through to the end of the arbitration section.]
Best regards,
NEXUS PRO CRYPTO INTELLIGENCE`

export default function ServiceAgreementPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-muted-foreground">
      <Link href="/dashboard" className="text-primary hover:underline">
        ← Back to app
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-foreground">Service Agreement</h1>
      <p className="mt-2 text-xs">Last Updated: 2023/05/26</p>

      <details open className="mt-6 rounded-xl border border-border/70 bg-card/70 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Agreement Text</summary>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
          {SERVICE_AGREEMENT_TEXT}
        </pre>
      </details>
    </main>
  )
}
