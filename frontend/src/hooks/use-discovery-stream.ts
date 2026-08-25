import { discoverStreamUrl, type DiscoverRequest, type DiscoveryStreamEvent } from '@/lib/discovery'

type StartDiscoveryOptions = {
  token: string
  body: DiscoverRequest
  signal?: AbortSignal
  onEvent: (event: DiscoveryStreamEvent) => void
}

function parseEventChunk(chunk: string): DiscoveryStreamEvent | null {
  const eventType = chunk.match(/^event: (.+)$/m)?.[1]
  const dataLine = chunk.match(/^data: (.+)$/m)?.[1]
  if (!eventType) return null

  if (eventType === 'done') return { type: 'done' }
  if (!dataLine) return null

  if (eventType === 'progress') return { type: 'progress', message: JSON.parse(dataLine) as string }
  if (eventType === 'result') return { type: 'result', cameras: JSON.parse(dataLine) }
  return null
}

export async function startDiscoveryStream({ body, onEvent, signal, token }: StartDiscoveryOptions) {
  const response = await fetch(discoverStreamUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok || !response.body) throw new Error(`Discovery stream failed: ${response.status}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      const event = parseEventChunk(chunk)
      if (event) onEvent(event)
    }
  }
}
