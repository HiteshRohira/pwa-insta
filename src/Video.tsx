import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Play, Pause, Volume2, VolumeX, Heart } from './InstagramIcons';
import { cachedVideoSource } from './mediaCache';
import { ReelAudio, unlockReelAudio, usesAmbientReelAudio } from './reelAudio';
import { Pressable, emitFeelTelemetry } from '@pwacn/react';

type Hold = 'none' | 'pause' | 'speed';
export function Video({ src, poster, active, autoplay, muted, onMutedChange, label, reel = false, onLike }: {
  src: string; poster: string; active: boolean; autoplay: boolean; muted: boolean;
  onMutedChange: (muted: boolean) => void; label: string; reel?: boolean; onLike?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number; zone: 'center' | 'edge' } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressClick = useRef(false);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(!document.hidden);
  const [intent, setIntent] = useState(autoplay);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [soundFailed, setSoundFailed] = useState(false);
  const [speedActive, setSpeedActive] = useState(false);
  const [speedFailed, setSpeedFailed] = useState(false);
  const ambientSound = reel && usesAmbientReelAudio;
  const audio = useRef<ReelAudio | null>(null);
  const [hold, setHold] = useState<Hold>('none');
  const [controls, setControls] = useState(true);
  const [likeFlash, setLikeFlash] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setControls(true); const timer=setTimeout(()=>setControls(false),200); return()=>clearTimeout(timer); },[playing,active]);
  useEffect(() => { if(!likeFlash)return;const timer=setTimeout(()=>setLikeFlash(false),650);return()=>clearTimeout(timer); },[likeFlash]);
  const enabled = active && visible && foreground;
  const [resolved,setResolved]=useState<{src:string;url:string}|null>(null);
  useEffect(()=>{if(!enabled||!src){setResolved(null);return;}let disposed=false;let url='';void cachedVideoSource(src).then(value=>{url=value;if(disposed){if(value.startsWith('blob:'))URL.revokeObjectURL(value);}else setResolved({src,url:value});});return()=>{disposed=true;if(url.startsWith('blob:'))URL.revokeObjectURL(url);};},[enabled,src]);
  const playable=enabled&&resolved?.src===src?resolved.url:undefined;
  useEffect(() => {
    setSoundFailed(false);
    if (!ambientSound || !enabled || !playable || !ref.current) return;
    const controller = new ReelAudio(ref.current, playable, () => setSoundFailed(true), () => setSpeedFailed(true));
    audio.current = controller;
    controller.setMuted(muted);
    return () => { controller.dispose(); if (audio.current === controller) audio.current = null; };
  }, [ambientSound, enabled, playable]);
  useEffect(() => { audio.current?.setMuted(muted); }, [muted]);
  const unlockSound = () => {
    if (ambientSound) void unlockReelAudio().catch(() => setSoundFailed(true));
  };

  const endHold = () => {
    clearTimeout(holdTimer.current);
    pointer.current = null;
    if (audio.current) audio.current.setSpeed(false);
    else if (ref.current) ref.current.playbackRate = 1;
    setSpeedActive(false);
    setSpeedFailed(false);
    setHold('none');
  };
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= .6), { threshold: [0, .6] });
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const update = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    setIntent(autoplay);
    setFailed(false);
    endHold();
  }, [active, autoplay, src]);
  useEffect(() => { if (!enabled) endHold(); }, [enabled]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // The ambient soundtrack already preserves pitch. Asking AVFoundation to
    // stretch the muted native track as well can rewind/stall the picture when
    // its rate changes. Configure once, never reapply during a hold/release.
    if (video.preservesPitch !== !ambientSound) video.preservesPitch = !ambientSound;
  }, [ambientSound]);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (ambientSound) audio.current?.setSpeed(hold === 'speed');
    else video.playbackRate = hold === 'speed' ? 2 : 1;
    if (enabled && playable && hold !== 'pause' && (intent || hold === 'speed')) {
      if (video.paused) void video.play().catch(() => { setPlaying(false); setIntent(false); });
    } else video.pause();
  }, [enabled, intent, hold, playable, ambientSound]);
  useEffect(() => () => { clearTimeout(holdTimer.current); clearTimeout(tapTimer.current); }, []);

  const toggle = () => {
    const video = ref.current;
    if (!video || !enabled) return;
    if (!video.paused) { setIntent(false); video.pause(); }
    else { if (!muted) unlockSound(); setIntent(true); if(playable)void video.play().catch(() => setIntent(false)); }
  };
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (!reel || event.button !== 0 || !enabled) return;
    endHold();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic test pointers have no capture target. */ }
    suppressClick.current = false;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const start = { id: event.pointerId, x: event.clientX, y: event.clientY, zone: x < .25 || x > .75 ? 'edge' as const : 'center' as const };
    pointer.current = start;
    holdTimer.current = setTimeout(() => {
      if (pointer.current !== start) return;
      suppressClick.current = true;
      const mode = start.zone === 'edge' ? 'speed' : 'pause';
      setHold(mode);
      if (mode === 'pause') ref.current?.pause();
      emitFeelTelemetry({ timestamp: performance.now(), primitive: 'StillVideo', gesture: mode === 'speed' ? 'hold-2x' : 'hold-pause', state: 'contact' });
    }, 250);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointer.current;
    if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
      suppressClick.current = true;
      endHold();
    }
  };
  const release = () => {
    if (hold !== 'none') emitFeelTelemetry({ timestamp: performance.now(), primitive: 'StillVideo', gesture: hold === 'speed' ? 'hold-2x' : 'hold-pause', state: 'complete' });
    endHold();
  };
  const muteButton = <Pressable className="mute" aria-label={muted ? 'Unmute video' : 'Mute video'} onPress={() => {
    if (muted) unlockSound();
    if (ref.current) ref.current.muted = ambientSound || !muted;
    onMutedChange(!muted);
  }}>{muted ? <VolumeX size={24} /> : <Volume2 size={24} />}</Pressable>;

  return <div className={'video ' + (reel ? 'reel-video' : '')} ref={box} data-video-active={enabled} data-hold={hold} data-playing={playing}>
    <video ref={ref} src={playable} poster={poster} muted={ambientSound || muted} autoPlay={autoplay} playsInline loop preload="none" aria-label={label}
      disablePictureInPicture={ambientSound} disableRemotePlayback={ambientSound}
      onRateChange={event => setSpeedActive(event.currentTarget.playbackRate === 2)}
      onPlay={() => { setPlaying(true); emitFeelTelemetry({ timestamp: performance.now(), primitive: 'StillVideo', gesture: 'play', state: 'complete' }); }}
      onPause={() => { setPlaying(false); emitFeelTelemetry({ timestamp: performance.now(), primitive: 'StillVideo', gesture: 'pause', state: 'complete' }); }}
      onError={() => setFailed(true)} />
    <button type="button" className={'video-toggle ' + (reel ? 'reel-touch-surface ' : '') + (playing ? 'is-playing' : '')}
      aria-label={reel ? 'Reel playback surface' : playing ? 'Pause video' : 'Play video'}
      onPointerDown={down} onPointerMove={move} onPointerUp={release}
      onPointerCancel={() => { suppressClick.current = true; release(); }}
      onContextMenu={event => event.preventDefault()}
      onClick={event => { if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return; } if(event.detail===0||!onLike){toggle();return;} clearTimeout(tapTimer.current);if(event.detail===1)tapTimer.current=setTimeout(toggle,220); }}
      onDoubleClick={event=>{event.preventDefault();clearTimeout(tapTimer.current);if(onLike){setLikeFlash(true);onLike();}}}>
      {!reel && <span>{playing ? <Pause size={26} /> : <Play size={28} />}</span>}
    </button>
    {reel ? <div className={'reel-player-controls ' + (playing && !controls && hold !== 'pause' ? 'controls-hidden' : '')}>
      {muteButton}
      <Pressable className="reel-play-control" aria-label={playing ? 'Pause video' : 'Play video'} onPress={toggle}>{playing ? <Pause size={32} /> : <Play size={32} />}</Pressable>
    </div> : muteButton}
    {likeFlash && <div className="double-like-heart" aria-hidden="true"><Heart size={84} filled/></div>}
    {hold === 'speed' && <div className="reel-speed-indicator" role="status">{speedActive ? '2×' : speedFailed ? '2× unavailable' : 'Preparing 2×…'}</div>}
    {failed && <p className="video-error">Video couldn’t load. Try again when connected.</p>}
    {soundFailed && !muted && <p className="video-error" role="status">Reel sound couldn’t load. <button onClick={() => { setSoundFailed(false); unlockSound(); audio.current?.retry(); }}>Retry sound</button></p>}
  </div>;
}
