import { AnalyticsIcon } from "@/components/icons/nav-icons";

const STEPS = [
  "Create a Google Cloud service account and enable the Google Analytics Data API.",
  "Add the service account as a Viewer on each GA4 property.",
  "Set GA_SERVICE_ACCOUNT_EMAIL, GA_PRIVATE_KEY and GA_PROPERTIES on the backend.",
];

/** Shown until the backend has credentials and at least one property. */
export function SetupSteps() {
  return (
    <div className="panel mx-auto max-w-xl border-dashed p-8">
      <AnalyticsIcon className="h-8 w-8 text-[var(--muted-light)]" />
      <h2 className="mt-3 text-base font-semibold">Connect Google Analytics</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Website stats appear here once the backend can read them. It takes three steps, and the
        details are under “Website analytics” in deploy/README.md.
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
