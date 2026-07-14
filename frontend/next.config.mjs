/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  webpack: (config) => {
    // onnxruntime-web references node builtins in code paths we never hit in the
    // browser wasm EP — stub them so the client bundle builds cleanly.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
  async headers() {
    return [
      {
        // Model + wasm are content-addressed by our build; cache them hard.
        source: "/:path(models|ort)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};
export default nextConfig;
