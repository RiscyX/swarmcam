import { useEffect, useState, type RefObject } from 'react'

import { cameraMseUrl } from '@/lib/cameras'

// go2rtc matches this list against the stream's actual codec and returns
// the concrete MIME type for the SourceBuffer in its reply.
const CODECS = 'avc1.640029,avc1.64002a,avc1.4d002a,avc1.42e01f,mp4a.40.2'
// A buffer longer than this is trimmed, and with more lag than this we jump to
// the live edge — without it the picture would keep drifting behind.
const MAX_BUFFER_S = 10
const MAX_DRIFT_S = 1.5
// Retry after a dropped connection, because the phone's Wi-Fi hiccups
// regularly; only fall back on a persistent failure.
const RETRY_DELAY_MS = 2000
const MAX_ATTEMPTS = 3
// The frame count is averaged over a window this long. With a shorter window the
// displayed number visibly jumps, because the phone's frame rate varies with light.
const FPS_WINDOW_MS = 3000

const MSE_SUPPORTED = typeof MediaSource !== 'undefined'

/**
 * Plays the camera's H.264 stream from go2rtc's MSE feed, as fMP4
 * segments. There is no re-encoding on either the server or the client:
 * the browser's native H.264 decoder gets the same picture stream
 * Frigate works from.
 *
 * The return value is true if MSE persistently fails — the caller can then
 * fall back to the MJPEG proxy.
 */
export type MseStream = {
  /** MSE persistently fails — the caller can fall back to the MJPEG proxy. */
  failed: boolean
  /** The stream's actual frame rate, or null if it cannot be measured yet. */
  fps: number | null
}

export function useMseStream(
  videoRef: RefObject<HTMLVideoElement | null>,
  name: string,
  enabled: boolean,
): MseStream {
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video || !MSE_SUPPORTED) return undefined

    const queue: ArrayBuffer[] = []
    let mediaSource: MediaSource | null = null
    let objectUrl: string | null = null
    let socket: WebSocket | null = null
    let buffer: SourceBuffer | null = null
    let retryTimer: number | undefined
    let attempt = 0
    let disposed = false

    function drain() {
      if (!buffer || buffer.updating || queue.length === 0) return
      try {
        buffer.appendBuffer(queue.shift() as ArrayBuffer)
      } catch {
        giveUpOrRetry()
      }
    }

    function keepUpWithLive() {
      if (!buffer || buffer.updating || buffer.buffered.length === 0) return
      const start = buffer.buffered.start(0)
      const end = buffer.buffered.end(buffer.buffered.length - 1)

      if (end - start > MAX_BUFFER_S) {
        try {
          buffer.remove(start, end - MAX_BUFFER_S / 2)
          return
        } catch {
          /* skipping the trim is not critical, the next updateend retries it */
        }
      }
      const target = videoRef.current
      if (target && end - target.currentTime > MAX_DRIFT_S) {
        target.currentTime = end - 0.1
      }
    }

    function handleMessage(event: MessageEvent) {
      if (typeof event.data !== 'string') {
        queue.push(event.data as ArrayBuffer)
        drain()
        return
      }
      let mime: string
      try {
        const message = JSON.parse(event.data)
        if (message?.type !== 'mse') return
        mime = String(message.value)
      } catch {
        return
      }
      try {
        buffer = mediaSource?.addSourceBuffer(mime) ?? null
        if (!buffer) return
        buffer.mode = 'segments'
        buffer.addEventListener('updateend', () => {
          keepUpWithLive()
          drain()
        })
        attempt = 0
      } catch {
        giveUpOrRetry()
      }
    }

    function teardown() {
      if (socket) {
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        socket.close()
        socket = null
      }
      buffer = null
      queue.length = 0
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }
      mediaSource = null
    }

    function giveUpOrRetry() {
      if (disposed) return
      teardown()
      attempt += 1
      if (attempt >= MAX_ATTEMPTS) {
        setFailedFor(name)
        return
      }
      retryTimer = window.setTimeout(connect, RETRY_DELAY_MS)
    }

    function connect() {
      if (disposed) return
      const target = videoRef.current
      if (!target) return

      const source = new MediaSource()
      mediaSource = source
      objectUrl = URL.createObjectURL(source)
      source.addEventListener('sourceopen', () => {
        if (disposed || mediaSource !== source) return
        socket = new WebSocket(cameraMseUrl(name))
        socket.binaryType = 'arraybuffer'
        socket.onopen = () => socket?.send(JSON.stringify({ type: 'mse', value: CODECS }))
        socket.onmessage = handleMessage
        socket.onerror = giveUpOrRetry
        socket.onclose = giveUpOrRetry
      })
      target.src = objectUrl
      void target.play().catch(() => { /* autoplay can fail even on a muted video */ })
    }

    connect()

    return () => {
      disposed = true
      window.clearTimeout(retryTimer)
      teardown()
      video.removeAttribute('src')
      video.load()
    }
  }, [name, enabled, videoRef])

  // The increment of the decoded-frame counter — this is the rate the camera
  // actually delivers, not Frigate's detect fps. Dropped frames count too,
  // because the camera did send them.
  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video || !MSE_SUPPORTED) return undefined
    if (typeof video.getVideoPlaybackQuality !== 'function') return undefined

    let lastFrames = video.getVideoPlaybackQuality().totalVideoFrames
    let lastAt = performance.now()

    const intervalId = window.setInterval(() => {
      const target = videoRef.current
      if (!target || typeof target.getVideoPlaybackQuality !== 'function') return
      const frames = target.getVideoPlaybackQuality().totalVideoFrames
      const now = performance.now()
      const elapsed = (now - lastAt) / 1000
      // On reconnect the counter resets; in that case we just start over.
      setFps(frames >= lastFrames && elapsed > 0 ? (frames - lastFrames) / elapsed : null)
      lastFrames = frames
      lastAt = now
    }, FPS_WINDOW_MS)

    return () => {
      window.clearInterval(intervalId)
      setFps(null)
    }
  }, [name, enabled, videoRef])

  return { failed: failedFor === name || !MSE_SUPPORTED, fps }
}
