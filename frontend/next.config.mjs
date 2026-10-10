/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the site is plain HTML/JS served by the FastAPI app (one deployable unit).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};
export default nextConfig;
