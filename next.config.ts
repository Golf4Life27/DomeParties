import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // /gift is retired: the venue's real gift cards are sold through
        // Trackman, and this app selling a parallel one meant a customer could
        // walk in with a code the register doesn't know. Redirects are checked
        // before the filesystem, so the old page is unreachable.
        //
        // Kept as 307 (permanent: false) rather than 308 on purpose — a 308 is
        // cached by browsers indefinitely, which would make reinstating an
        // in-app gift card later a support problem.
        //
        // Literal URL rather than VENUE.trackmanBookingUrl: next.config is
        // loaded outside the app's module graph, so the `@/` alias isn't
        // available here. Keep the two in sync if the venue ever moves.
        source: "/gift",
        destination: "https://booking.trackmangolf.com/venues/whitetail/booking",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
