import { useState } from 'react';
import { assetUrl } from '../../utils/assets';
import { parseVideo } from '../../utils/video';

/**
 * A video that only loads when someone presses play: until then it is a picture with a play button,
 * so pages stay fast on mobile data. YouTube and Vimeo play in their own player; uploaded files in the browser's.
 */
export const VideoPlayer = ({ url, poster, title = 'Video', className = '' }) => {
  const [playing, setPlaying] = useState(false);
  const video = parseVideo(url);
  if (!video) return null;
  const cover = poster ? assetUrl(poster) : video.thumb;
  return (
    <div className={`vp ${className}`}>
      {playing ? (
        video.kind === 'file'
          ? <video className="vp__media" src={assetUrl(video.src)} poster={cover || undefined} controls autoPlay playsInline preload="metadata" />
          : (
            <iframe className="vp__media" src={video.src} title={title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
          )
      ) : (
        <button type="button" className="vp__cover" onClick={() => setPlaying(true)} aria-label={`Play: ${title}`}>
          {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="vp__blank" aria-hidden="true" />}
          <span className="vp__play" aria-hidden="true"><i className="fas fa-play" /></span>
        </button>
      )}
    </div>
  );
};

export default VideoPlayer;
