const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#2f5f4f"/>
  <path d="M8 23 15.5 7 24 23h-3.4l-1.7-4H12l-1.6 4H8Zm5.1-6.8h4.7l-2.4-5.7-2.3 5.7Z" fill="#fff"/>
</svg>`;

export function GET() {
  return new Response(icon, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400"
    }
  });
}
