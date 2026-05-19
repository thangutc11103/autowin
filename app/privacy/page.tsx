export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16 text-gray-900">
      <div className="mx-auto max-w-3xl rounded-lg border border-gray-200 bg-white p-8">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-4 text-sm leading-6 text-gray-600">
          Autowin stores account connection details, publishing jobs, uploaded
          media references, and operational logs needed to provide video
          discovery and publishing workflows. OAuth tokens are stored securely
          and used only to access connected services requested by the user.
        </p>
        <p className="mt-4 text-sm leading-6 text-gray-600">
          To request deletion of account-linked data, contact the app
          administrator or use the platform data deletion flow. Deletion
          requests are tracked with a confirmation code.
        </p>
      </div>
    </main>
  );
}
