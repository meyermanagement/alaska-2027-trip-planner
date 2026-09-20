/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Approved pre-beta rollout after the history migration and production dry run.
  // Keep UI notices and server cleanup on the same build-time setting.
  // Set this value to "false" and redeploy to pause completed-history cleanup.
  env: {
    NEXT_PUBLIC_HISTORY_RETENTION_ENABLED: "true",
  },
  // nodemailer reaches for modules at runtime, which webpack cannot follow into
  // a serverless bundle. Left to itself the SMTP send fails only in production.
  serverExternalPackages: ["nodemailer"],
  // The tab was called People until pets moved onto it. Reminder emails already
  // sent point at /people, and so do any bookmarks, so the old address keeps
  // working rather than becoming a 404 in somebody's inbox.
  async redirects() {
    return [{ source: "/people", destination: "/family", permanent: false }];
  },
};

export default nextConfig;
