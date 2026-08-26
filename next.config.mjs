/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // nodemailer reaches for modules at runtime, which webpack cannot follow into
  // a serverless bundle. Left to itself the SMTP send fails only in production.
  serverExternalPackages: ["nodemailer"],
};

export default nextConfig;
