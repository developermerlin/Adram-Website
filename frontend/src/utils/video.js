// What kind of video an address is, for the video sections (components/ui/VideoSection.jsx):
// a YouTube or Vimeo link (played in their own player) or a video file (an upload in /media/, or any https .mp4/.webm).

const YOUTUBE = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i;
const VIMEO = /^https?:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/i;
const FILE = /^(\/media\/\S+|https:\/\/\S+)\.(mp4|webm|m4v)(\?\S*)?$/i;

/** { kind: 'youtube'|'vimeo'|'file', id?, src, thumb? } or null when the address isn't a video we can play. */
export const parseVideo = (url = '') => {
  const u = String(url).trim();
  let m = YOUTUBE.exec(u);
  if (m) {
    return { kind: 'youtube', id: m[1], src: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0&modestbranding=1`, thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
  }
  m = VIMEO.exec(u);
  if (m) return { kind: 'vimeo', id: m[1], src: `https://player.vimeo.com/video/${m[1]}?autoplay=1&dnt=1` };
  if (FILE.test(u)) return { kind: 'file', src: u };
  return null;
};

export default parseVideo;
