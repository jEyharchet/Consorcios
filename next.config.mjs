/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/*": ["./.cache/puppeteer/**/*"],
    },
  },
};

export default nextConfig;
