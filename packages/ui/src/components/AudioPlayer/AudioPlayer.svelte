<script lang="ts">
  import { onDestroy } from 'svelte'

  interface AudioPlayerLabels {
    skipBack: string
    play: string
    pause: string
    skipForward: string
    seek: string
    volume: string
  }

  let {
    src,
    labels: labelsProp = {},
  }: {
    src: string
    labels?: Partial<AudioPlayerLabels>
  } = $props()

  const defaultLabels: AudioPlayerLabels = {
    skipBack: 'Skip back 5 seconds',
    play: 'Play',
    pause: 'Pause',
    skipForward: 'Skip forward 5 seconds',
    seek: 'Seek',
    volume: 'Volume',
  }

  const labels = $derived({ ...defaultLabels, ...labelsProp })

  let playing = $state(false)
  let currentTime = $state(0)
  let duration = $state(0)
  let volume = $state(1)
  let audioEl: HTMLAudioElement | undefined = $state()
  let blobUrl = $state<string | null>(null)
  let loadError = $state(false)

  $effect(() => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      blobUrl = null
    }
  })

  onDestroy(() => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
    }
  })

  const progress = $derived(duration > 0 ? currentTime / duration : 0)

  const formattedTime = $derived(formatTime(currentTime))
  const formattedDuration = $derived(formatTime(duration))

  function formatTime(seconds: number): string {
    const s = Math.floor(seconds)
    const m = Math.floor(s / 60)
    const sec = s % 60
    if (m >= 60) {
      const h = Math.floor(m / 60)
      const rm = m % 60
      return `${h}:${String(rm).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  function togglePlay() {
    if (!audioEl) return
    if (playing) {
      audioEl.pause()
    } else {
      void audioEl.play()
    }
  }

  function seek(e: MouseEvent) {
    if (!audioEl || duration === 0) return
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audioEl.currentTime = ratio * duration
  }

  function skip(seconds: number) {
    if (!audioEl) return
    audioEl.currentTime = Math.max(0, Math.min(duration, audioEl.currentTime + seconds))
  }

  function setVolume(v: number) {
    if (!audioEl) return
    const clamped = Math.max(0, Math.min(1, v))
    audioEl.volume = clamped
    volume = clamped
  }

  function handleTimeUpdate() {
    if (!audioEl) return
    currentTime = audioEl.currentTime
  }

  function handleLoadedMetadata() {
    if (!audioEl) return
    duration = audioEl.duration
  }

  function handlePlay() {
    playing = true
  }

  function handlePause() {
    playing = false
  }

  function handleEnded() {
    playing = false
    currentTime = 0
  }

  function handleVolumeChange() {
    if (!audioEl) return
    volume = audioEl.volume
  }

  function handleError() {
    if (!src || blobUrl || !audioEl) return
    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        blobUrl = URL.createObjectURL(blob)
        audioEl!.src = blobUrl
        void audioEl!.play()
      })
      .catch((err) => {
        console.error('[AudioPlayer] Fallback load failed:', err)
        loadError = true
      })
  }
</script>

<div class="audio-player" data-testid="audio-player">
  <audio
    bind:this={audioEl}
    src={blobUrl ?? src}
    preload="metadata"
    ontimeupdate={handleTimeUpdate}
    onloadedmetadata={handleLoadedMetadata}
    onplay={handlePlay}
    onpause={handlePause}
    onended={handleEnded}
    onvolumechange={handleVolumeChange}
    onerror={handleError}
  ></audio>

  {#if loadError}
    <p class="audio-player__error" data-testid="audio-load-error">
      No se pudo reproducir el audio. En Linux, esto suele deberse a una incompatibilidad entre
      WebKitGTK y GStreamer. Verificá que tu sistema tenga GStreamer ≥ 1.22.
    </p>
  {/if}

  <!-- Transport controls -->
  <div class="audio-player__transport">
    <button
      type="button"
      class="audio-player__btn audio-player__btn--skip"
      data-testid="audio-skip-back"
      aria-label={labels.skipBack}
      onclick={() => skip(-5)}
    >
      &#8634; 5s
    </button>

    <button
      type="button"
      class="audio-player__btn audio-player__btn--play"
      data-testid="audio-play-pause"
      aria-label={playing ? labels.pause : labels.play}
      onclick={togglePlay}
    >
      {playing ? '⏸' : '▶'}
    </button>

    <button
      type="button"
      class="audio-player__btn audio-player__btn--skip"
      data-testid="audio-skip-forward"
      aria-label={labels.skipForward}
      onclick={() => skip(5)}
    >
      5s &#8635;
    </button>
  </div>

  <!-- Progress bar -->
  <div
    class="audio-player__progress"
    data-testid="audio-progress-bar"
    onclick={seek}
    onkeydown={(e) => {
      if (e.key === 'ArrowRight') {
        skip(5)
      } else if (e.key === 'ArrowLeft') {
        skip(-5)
      } else if (e.key === 'Home') {
        if (audioEl) audioEl.currentTime = 0
      } else if (e.key === 'End') {
        if (audioEl) audioEl.currentTime = duration
      }
    }}
    role="slider"
    tabindex="0"
    aria-label={labels.seek}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(progress * 100)}
  >
    <div class="audio-player__progress-fill" style={`width: ${progress * 100}%`}></div>
  </div>

  <!-- Time display -->
  <div class="audio-player__time" data-testid="audio-time">
    <span data-testid="audio-current-time">{formattedTime}</span>
    <span class="audio-player__time-sep">/</span>
    <span data-testid="audio-duration">{formattedDuration}</span>
  </div>

  <!-- Volume -->
  <div class="audio-player__volume">
    <label class="audio-player__volume-label" for="audio-volume-slider">🔊</label>
    <input
      id="audio-volume-slider"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={volume}
      oninput={(e) => setVolume(parseFloat((e.target as HTMLInputElement).value))}
      class="audio-player__volume-slider"
      data-testid="audio-volume-slider"
      aria-label={labels.volume}
    />
  </div>
</div>

<style>
  .audio-player {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    height: 100%;
    padding: var(--space-6);
    background-color: var(--color-bg);
  }

  .audio-player__transport {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .audio-player__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    font-size: var(--font-size-sm);
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }

  .audio-player__btn:hover {
    background-color: var(--color-surface-raised);
    border-color: var(--color-text-muted);
  }

  .audio-player__btn--play {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-full);
    font-size: var(--font-size-xl);
    border-color: var(--color-accent);
    background-color: var(--color-surface-raised);
  }

  .audio-player__btn--play:hover {
    background-color: var(--color-accent);
    color: var(--color-text-on-accent, #fff);
  }

  .audio-player__progress {
    width: 100%;
    max-width: 480px;
    height: 6px;
    background-color: var(--color-border);
    border-radius: var(--radius-full);
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }

  .audio-player__progress:hover {
    height: 8px;
  }

  .audio-player__progress-fill {
    height: 100%;
    background-color: var(--color-accent);
    border-radius: var(--radius-full);
    transition: width 0.1s linear;
  }

  .audio-player__time {
    display: flex;
    gap: var(--space-1);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .audio-player__time-sep {
    color: var(--color-text-muted);
  }

  .audio-player__volume {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .audio-player__volume-label {
    font-size: var(--font-size-md);
    cursor: default;
  }

  .audio-player__volume-slider {
    width: 80px;
    accent-color: var(--color-accent);
  }

  .audio-player__error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: rgba(255, 143, 143, 0.12);
    color: #ff8f8f;
    font-size: var(--font-size-sm);
    text-align: center;
    max-width: 480px;
  }
</style>
