/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The live surface is gated by NEXT_PUBLIC_SIGNAL_ROOM_LIVE (default off, §7.3).
  // When the engine repo re-points the Signal Room tile, it rewrites to this app.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Faraday-Surface", value: "signal-room" }],
      },
    ];
  },
};

export default nextConfig;
