/**
 * NDJSON(Newline Delimited JSON) 인코더·디코더 (TECH_SPEC §3.6, §5)
 *
 * /api/verify가 진행률·항목·완료 이벤트를 한 줄에 하나씩 흘려보내는 데 사용한다.
 * 인코더는 서버(Route Handler), 디코더는 클라이언트(훅)에서 사용한다.
 * 토큰을 다루지 않으므로 서버/클라이언트 공용 모듈이다.
 */

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

/** NDJSON 스트림 응답에 공통으로 붙이는 헤더. 결과를 어디에도 캐시하지 않는다. */
export const NDJSON_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': `${NDJSON_CONTENT_TYPE}; charset=utf-8`,
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Accel-Buffering': 'no', // 프록시 버퍼링으로 진행률이 뭉치는 것을 방지
};

/** 값 1건을 NDJSON 한 줄 문자열로 직렬화한다. (개행 포함) */
export function encodeNdjsonLine<T>(value: T): string {
  return `${JSON.stringify(value)}\n`;
}

export interface NdjsonEncoder {
  /** 값 1건을 스트림에 바로 enqueue할 수 있는 바이트로 변환한다. */
  encode<T>(value: T): Uint8Array;
}

/** 서버용 인코더 생성. TextEncoder를 재사용해 청크마다 재생성하지 않는다. */
export function createNdjsonEncoder(): NdjsonEncoder {
  const textEncoder = new TextEncoder();
  return {
    encode<T>(value: T): Uint8Array {
      return textEncoder.encode(encodeNdjsonLine(value));
    },
  };
}

export interface NdjsonDecoder<T> {
  /** 도착한 텍스트 조각을 누적하고, 완성된 줄만 파싱해 반환한다. */
  push(chunk: string): T[];
  /** 스트림 종료 시 남은 버퍼를 파싱해 반환한다. */
  flush(): T[];
}

/**
 * 클라이언트용 디코더 생성.
 * 청크 경계가 줄 중간을 자를 수 있으므로 완성된 줄만 파싱하고 나머지는 버퍼에 남긴다.
 * JSON 파싱에 실패한 줄은 조용히 버린다. (중간 이벤트 1건 손실이 전체 스트림을 깨지 않게 함)
 */
export function createNdjsonDecoder<T>(): NdjsonDecoder<T> {
  let buffer = '';

  const parseLine = (line: string): T | undefined => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return undefined;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return undefined;
    }
  };

  return {
    push(chunk: string): T[] {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      const values: T[] = [];
      for (const line of lines) {
        const value = parseLine(line);
        if (value !== undefined) values.push(value);
      }
      return values;
    },
    flush(): T[] {
      const rest = buffer;
      buffer = '';
      const value = parseLine(rest);
      return value === undefined ? [] : [value];
    },
  };
}

/**
 * ReadableStream을 NDJSON 이벤트 단위로 순회한다. (클라이언트 전용)
 *
 * 사용 예:
 *   for await (const event of readNdjsonStream<VerifyEvent>(response.body)) { ... }
 */
export async function* readNdjsonStream<T>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T, void, undefined> {
  const reader = stream.getReader();
  const textDecoder = new TextDecoder();
  const decoder = createNdjsonDecoder<T>();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of decoder.push(textDecoder.decode(value, { stream: true }))) {
        yield event;
      }
    }
    for (const event of decoder.push(textDecoder.decode())) {
      yield event;
    }
    for (const event of decoder.flush()) {
      yield event;
    }
  } finally {
    reader.releaseLock();
  }
}
