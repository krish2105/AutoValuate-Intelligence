/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // framer-motion 11.15+ ships motion-dom/motion-utils as pure ESM with a circular import
  // between css-variables-conversion.mjs and errors.mjs. Next's webpack dev bundler executes
  // that cycle out of order ("Cannot read properties of undefined (reading 'call')", blank
  // page, hydration failure on every route). Transpiling forces these through Next's own
  // loader instead of consuming the prebuilt dist output, which resolves the ordering.
  transpilePackages: ["framer-motion", "motion-dom", "motion-utils"],
  webpack: (config) => {
    // onnxruntime-web references node builtins in code paths we never hit in the
    // browser wasm EP — stub them so the client bundle builds cleanly.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
  async headers() {
    return [
      {
        // Model + wasm really are content-addressed now, so `immutable` is honest:
        //   /models/best.onnx?v=<sha256[:12]>   (scripts/cv-version.mjs)
        //   /ort/<ort-version>/…               (scripts/copy-ort.mjs)
        // New bytes always arrive under a new URL, so a year-long immutable cache can
        // never hide a redeploy. Do NOT revert either to a fixed path while this header
        // stands — that combination silently pins every returning user to old weights.
        source: "/:path(models|ort)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};
export default nextConfig;
