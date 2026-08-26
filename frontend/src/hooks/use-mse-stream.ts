import { useEffect, useState, type RefObject } from 'react'

import { cameraMseUrl } from '@/lib/cameras'

// A go2rtc ezt a listát egyezteti a stream tényleges codecjével, és a
// válaszában adja vissza a konkrét MIME-típust a SourceBufferhez.
const CODECS = 'avc1.640029,avc1.64002a,avc1.4d002a,avc1.42e01f,mp4a.40.2'
// Ennél hosszabb puffert vágunk, és ennél nagyobb lemaradásnál az élő
// szélére ugrunk — enélkül a kép folyamatosan csúszna hátra.
const MAX_BUFFER_S = 10
const MAX_DRIFT_S = 1.5
// Egy-egy megszakadt kapcsolat után újrapróbálkozunk, mert a telefon
// wifije rendszeresen megbicsaklik; csak tartós hiba esetén esünk vissza.
const RETRY_DELAY_MS = 2000
const MAX_ATTEMPTS = 3

const MSE_SUPPORTED = typeof MediaSource !== 'undefined'

/**
 * A kamera H.264 streamjét játssza le a go2rtc MSE feedjéből, fMP4
 * szegmensekként. Nincs se szerveroldali, se kliensoldali újrakódolás:
 * a böngésző natív H.264 dekódere kapja meg ugyanazt a képfolyamot,
 * amiből a Frigate is dolgozik.
 *
 * A visszatérési érték akkor igaz, ha az MSE tartósan nem működik — ilyenkor
 * a hívó az MJPEG proxyra eshet vissza.
 */
export function useMseStream(
  videoRef: RefObject<HTMLVideoElement | null>,
  name: string,
  enabled: boolean,
): boolean {
  const [failedFor, setFailedFor] = useState<string | null>(null)

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
          /* a vágás kihagyása nem kritikus, a következő updateend újrapróbálja */
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
      void target.play().catch(() => { /* az autoplay a némított videón is elbukhat */ })
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

  return failedFor === name || !MSE_SUPPORTED
}
