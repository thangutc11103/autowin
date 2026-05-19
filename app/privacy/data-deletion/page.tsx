export default async function DataDeletionStatusPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const code = params?.code || "pending";

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-16 text-gray-900">
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-8">
        <h1 className="text-2xl font-bold">Data deletion request</h1>
        <p className="mt-4 text-sm leading-6 text-gray-600">
          Your request has been received. We will process account-linked data
          deletion according to our privacy policy and platform requirements.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          Confirmation code:{" "}
          <span className="font-mono text-gray-900">
            {code}
          </span>
        </p>
      </div>
    </main>
  );
}
