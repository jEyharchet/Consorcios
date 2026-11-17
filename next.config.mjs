/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    // Comprobantes de gastos hasta 4 MB (src/lib/gasto-comprobante.ts); Vercel acepta 4,5 MB por request.
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
