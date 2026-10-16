import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { emitFeelTelemetry } from '@pwacn/react';

export function ReelCaption({ text, active }: { text: string; active: boolean }) {
  const copy = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => { if (!active) setExpanded(false); }, [active]);
  useLayoutEffect(() => {
    const node = copy.current;
    if (!node || expanded) return;
    const measure = () => setTruncated(node.scrollWidth > node.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, active, expanded]);
  return <div className={'reel-caption-copy ' + (expanded ? 'caption-expanded' : '')}>
    <p ref={copy} className="caption-text">{text}</p>
    {(truncated || expanded) && <button className="caption-more" type="button" aria-expanded={expanded} onClick={() => {
      setExpanded(value => !value);
      emitFeelTelemetry({ timestamp: performance.now(), primitive: 'ReelCaption', gesture: 'expand', state: 'complete' });
    }}>{expanded ? 'see less' : 'see more'}</button>}
  </div>;
}
