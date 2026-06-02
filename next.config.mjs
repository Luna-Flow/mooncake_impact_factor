const isStatic = process.env.NEXT_PUBLIC_APP_MODE === "static";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isStatic ? "export" : undefined,
  trailingSlash: isStatic,
  basePath: basePath || undefined,
};

export default nextConfig;
