/* eslint-disable react/no-unescaped-entities */

export default function PrivacyPolicyPage() {
    return (
        <main className="min-h-screen bg-gray-50 px-6 py-16 text-gray-900">
            <div className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-8">
                <h1 className="mb-6 text-3xl font-bold">Privacy Policy</h1>

                <div className="space-y-6 text-sm leading-7 text-gray-700">

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">1. Introduction</h2>
                        <p>
                            This Privacy Policy describes how our application ("Service") collects, uses, and manages your personal data. We are committed to protecting your privacy and ensuring transparent data practices in compliance with applicable regulations.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">2. What Data We Collect</h2>
                        <p className="mb-2">Our application may collect the following types of personal data:</p>
                        <ul className="space-y-2 pl-5 list-disc">
                            <li><strong>Account Information:</strong> Username, email address, login credentials</li>
                            <li><strong>Social Media Account Data:</strong> Facebook Page ID, Instagram Business Account ID, account name and display information</li>
                            <li><strong>Authentication Tokens:</strong> OAuth access tokens and refresh tokens from Facebook and Instagram</li>
                            <li><strong>Content Data:</strong> Post content, captions, hashtags, images, and videos that you choose to upload or publish through our service</li>
                            <li><strong>Engagement Metrics:</strong> Views, likes, comments, and other engagement data from your posts (retrieved through Meta Graph API)</li>
                            <li><strong>Device Information:</strong> IP address, browser type, and usage logs for service operation</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">3. Where We Collect Data From</h2>
                        <p>
                            Data is collected through the following methods:
                        </p>
                        <ul className="space-y-2 pl-5 list-disc">
                            <li>
                                <strong>User Registration:</strong> When you create an account with our service, you provide account information directly.
                            </li>
                            <li>
                                <strong>Meta Graph API:</strong> After you log in with your Facebook/Instagram account and grant permissions, our application retrieves your social media data through Meta's official Graph API. This includes page information, account details, and metrics you authorize us to access.
                            </li>
                            <li>
                                <strong>Direct User Action:</strong> When you create posts, upload media, or interact with our service features.
                            </li>
                            <li>
                                <strong>Automatic Collection:</strong> Server logs, IP addresses, and usage data are collected automatically when you use our service.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">4. How We Use Your Data</h2>
                        <p className="mb-2">We use your data exclusively to provide and improve our service:</p>
                        <ul className="space-y-2 pl-5 list-disc">
                            <li>To establish and verify your account identity</li>
                            <li>To connect your Facebook Pages and Instagram Business Accounts to our platform</li>
                            <li>To display a list of Pages and accounts you manage and can publish to</li>
                            <li>To retrieve engagement metrics and post performance data</li>
                            <li>To create, preview, and publish posts to your selected Facebook Pages and Instagram Business Accounts</li>
                            <li>To schedule posts for automatic publishing at specified times</li>
                            <li>To manage and organize your content and publishing queue</li>
                            <li>To monitor service health and prevent abuse</li>
                            <li>To improve our service features and user experience</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">5. Data Sharing and Third Parties</h2>
                        <p className="mb-2">
                            <strong>We do not sell or profit from your personal data.</strong>
                        </p>
                        <p className="mb-2">
                            Your data is shared only in the following circumstances:
                        </p>
                        <ul className="space-y-2 pl-5 list-disc">
                            <li>
                                <strong>Meta Platforms:</strong> Your Facebook and Instagram data is shared with Meta as required to publish content to your accounts through their official APIs. Your consent for this is granted when you authorize our application.
                            </li>
                            <li>
                                <strong>Infrastructure Providers:</strong> We use third-party cloud hosting and database services to store and process your data. These providers are contractually obligated to maintain confidentiality.
                            </li>
                            <li>
                                <strong>Legal Compliance:</strong> We may disclose your data if required by law, court order, or government request.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">6. Data Retention and Storage</h2>
                        <p>
                            Your data is retained as long as you maintain an active account with our service. Specifically:
                        </p>
                        <ul className="space-y-2 pl-5 list-disc">
                            <li>Account information and authentication tokens are stored during your active subscription</li>
                            <li>Published posts and engagement data are retained for historical reporting</li>
                            <li>Deletion requests are tracked and processed according to this policy</li>
                            <li>After account deletion, personal data is permanently removed within 30 days, except where required by law for compliance purposes</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">7. Your Data Rights and Deletion Requests</h2>
                        <p className="mb-2">
                            You have the right to request deletion of your account and associated personal data at any time. To request data deletion:
                        </p>
                        <ul className="space-y-2 pl-5 list-disc">
                            <li>
                                <strong>Via Web Form:</strong> Visit <a href="/data-deletion" className="text-blue-600 hover:underline">/data-deletion</a> and submit your deletion request
                            </li>
                            <li>
                                <strong>Via Email:</strong> Contact us at <a href="mailto:thangutc11103@gmail.com" className="text-blue-600 hover:underline">thangutc11103@gmail.com</a> with your request to delete all personal data
                            </li>
                        </ul>
                        <p className="mt-3">
                            Upon receipt, we will process your deletion request and remove all account-linked data within 30 days, providing you with a confirmation and deletion code.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">8. Security</h2>
                        <p>
                            We implement industry-standard security measures to protect your data, including encryption, secure authentication, and access controls. However, no system is completely secure, and we cannot guarantee absolute security of your information.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">9. Children's Privacy</h2>
                        <p>
                            Our service is not intended for individuals under 13 years of age. We do not knowingly collect data from children under 13. If we discover such data has been collected, we will delete it immediately.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">10. Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. Material changes will be communicated to you via email or prominent notice on our service. Your continued use of the service constitutes your acceptance of the updated policy.
                        </p>
                    </section>

                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-gray-900">11. Contact Us</h2>
                        <p>
                            If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact:
                        </p>
                        <p className="mt-2 font-semibold">
                            Email: <a href="mailto:thangutc11103@gmail.com" className="text-blue-600 hover:underline">thangutc11103@gmail.com</a>
                        </p>
                        <p className="text-xs text-gray-500 mt-4">
                            Last updated: {new Date().toLocaleDateString()}
                        </p>
                    </section>

                </div>
            </div>
        </main>
    );
}
