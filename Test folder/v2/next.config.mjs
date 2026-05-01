// /** @type {import('next').NextConfig} */
// const nextConfig = {
//   output: 'standalone',
//   poweredByHeader: false,
//   reactStrictMode: true
// };

// export default nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    '10.8.0.4',
    'chill.kamnh.site',
    '*.kamnh.site',
    'localhost',
    '127.0.0.1',
  ],
}

export default nextConfig