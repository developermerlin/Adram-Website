import { Link } from 'react-router-dom';
import { parseVideo } from '../../utils/video';
import { VideoPlayer } from './VideoPlayer';

/**
 * A page's video section, from its Site content "Video" block:
 *   { show, eyebrow, title, text, url, poster, layout: 'right' | 'left' | 'wide', buttonLabel, buttonLink }
 * Hidden until it is switched on and has a video an admin added.
 */
export const VideoSection = ({ video, surface = false }) => {
  if (!video?.show || !parseVideo(video.url)) return null;
  const layout = ['left', 'wide'].includes(video.layout) ? video.layout : 'right';
  const external = /^https?:/i.test(video.buttonLink || '');
  const button = video.buttonLabel && video.buttonLink && (
    external
      ? <a href={video.buttonLink} target="_blank" rel="noopener noreferrer" className="btn btn--primary">{video.buttonLabel} <i className="fas fa-arrow-right" aria-hidden="true" /></a>
      : <Link to={video.buttonLink} className="btn btn--primary">{video.buttonLabel} <i className="fas fa-arrow-right" aria-hidden="true" /></Link>
  );
  return (
    <section className={`section vs vs--${layout}${surface ? ' section--surface' : ''}`}>
      <div className="container vs__inner">
        {(video.eyebrow || video.title || video.text) && (
          <div className="vs__copy">
            {video.eyebrow && <span className="eyebrow">{video.eyebrow}</span>}
            {video.title && <h2>{video.title}</h2>}
            {video.text && <p>{video.text}</p>}
            {layout !== 'wide' && button}
          </div>
        )}
        <VideoPlayer url={video.url} poster={video.poster} title={video.title || 'Video'} className="vs__player" />
        {layout === 'wide' && button && <div className="vs__after">{button}</div>}
      </div>
    </section>
  );
};

export default VideoSection;
