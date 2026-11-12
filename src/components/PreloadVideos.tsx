/** Hidden video elements that start buffering these files (Stage Output, the
 *  screen link), so a video slide starts at once instead of loading while
 *  it's on screen. */
export function PreloadVideos({ urls }: { urls: string[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0">
      {urls.map((u) => (
        <video key={u} src={u} preload="auto" muted playsInline />
      ))}
    </div>
  );
}
