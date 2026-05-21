"use client";

import { useState } from "react";

export default function DataDeletionPage() {
    const [email, setEmail] = useState("");
    const [reason, setReason] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage(null);
        setIsSubmitting(true);

        try {
            const response = await fetch("/api/privacy/data-deletion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, reason }),
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.error || "Failed to submit deletion request");
            }

            setMessage({
                type: "success",
                text: `Your data deletion request has been received. Confirmation code: ${result.code || "pending"}. We will process your request within 30 days.`,
            });
            setEmail("");
            setReason("");
        } catch (error) {
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to submit deletion request",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="min-h-screen bg-gray-50 px-6 py-16 text-gray-900">
            <div className="mx-auto max-w-2xl">
                <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
                    <h1 className="text-3xl font-bold mb-2">Request Data Deletion</h1>
                    <p className="text-sm text-gray-600 mb-6">
                        We take your privacy seriously. You can request deletion of all your account data and associated information at any time.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block">
                                <span className="text-sm font-semibold text-gray-700 mb-1 block">
                                    Email Address *
                                </span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    placeholder="Enter your account email"
                                />
                            </label>
                            <p className="text-xs text-gray-500 mt-1">
                                The email address associated with your account
                            </p>
                        </div>

                        <div>
                            <label className="block">
                                <span className="text-sm font-semibold text-gray-700 mb-1 block">
                                    Reason for Deletion (Optional)
                                </span>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none"
                                    rows={4}
                                    placeholder="Tell us why you'd like to delete your account (optional)"
                                />
                            </label>
                        </div>

                        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                            <p className="font-semibold mb-1">Important Information:</p>
                            <ul className="list-disc pl-5 space-y-1 text-xs">
                                <li>After submission, all your personal data will be deleted within 30 days</li>
                                <li>You will receive a confirmation code and can track your deletion request</li>
                                <li>This action cannot be undone</li>
                                <li>Some data may be retained for legal or compliance reasons</li>
                            </ul>
                        </div>

                        {message ? (
                            <div
                                className={`rounded-md border px-4 py-3 text-sm ${message.type === "success"
                                    ? "border-green-200 bg-green-50 text-green-800"
                                    : "border-red-200 bg-red-50 text-red-800"
                                    }`}
                            >
                                {message.text}
                            </div>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isSubmitting || !email}
                            className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-red-300"
                        >
                            {isSubmitting ? "Processing..." : "Request Data Deletion"}
                        </button>
                    </form>
                </div>

                <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
                    <h2 className="text-xl font-bold mb-4">Frequently Asked Questions</h2>
                    <div className="space-y-4 text-sm">
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-1">How long does deletion take?</h3>
                            <p className="text-gray-600">
                                We process deletion requests within 30 days. You will receive confirmation via email with a deletion code.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-1">What data gets deleted?</h3>
                            <p className="text-gray-600">
                                All personal data including account information, authentication tokens, saved posts, and metadata. See our <a href="/privacy-policy" className="text-blue-600 hover:underline">Privacy Policy</a> for details.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-1">Can I recover my data?</h3>
                            <p className="text-gray-600">
                                No, once deleted, your data cannot be recovered. Please ensure you have backed up any important information before requesting deletion.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-1">Need help?</h3>
                            <p className="text-gray-600">
                                Contact our support team at <a href="mailto:thangutc11103@gmail.com" className="text-blue-600 hover:underline">thangutc11103@gmail.com</a>
                            </p>
                        </div>
                    </div>
                </div>

                <footer className="mt-8 text-center text-xs text-gray-500">
                    <a href="/privacy-policy" className="text-blue-600 hover:underline">
                        Privacy Policy
                    </a>
                    <span> | </span>
                    <a href="/terms-of-service" className="text-blue-600 hover:underline">
                        Terms of Service
                    </a>
                </footer>
            </div>
        </main>
    );
}
